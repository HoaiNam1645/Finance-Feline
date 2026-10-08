import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  fromCategoryId: z.string().min(1),
  toCategoryId: z.string().min(1),
  scope: z.enum(["ALL", "TRANSACTIONS", "REQUESTS"]).optional().default("ALL"),
});

// Bulk re-filing: move everything booked under one category to another leaf category.
// Amounts and dates are untouched, only the category pointer moves.
export async function POST(request: Request) {
  const auth = await requireApiUser("category.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }
  if (parsed.data.fromCategoryId === parsed.data.toCategoryId) {
    return fail("Danh mục nguồn và đích phải khác nhau", 400);
  }

  const [source, target] = await Promise.all([
    prisma.transactionCategory.findUnique({
      where: { id: parsed.data.fromCategoryId },
      select: { id: true, name: true, type: true },
    }),
    prisma.transactionCategory.findFirst({
      where: { id: parsed.data.toCategoryId, isActive: true },
      select: { id: true, name: true, type: true, _count: { select: { children: true } } },
    }),
  ]);
  if (!source) {
    return fail("Danh mục nguồn không tồn tại", 404);
  }
  if (!target) {
    return fail("Danh mục đích không hợp lệ", 400);
  }
  if (target._count.children > 0) {
    return fail("Danh mục đích phải là danh mục con ở cấp sâu nhất", 400);
  }
  if (target.type !== source.type) {
    return fail("Danh mục đích phải cùng loại Thu/Chi với danh mục nguồn", 400);
  }

  const moveTransactions = parsed.data.scope !== "REQUESTS";
  const moveRequests = parsed.data.scope !== "TRANSACTIONS";

  const result = await prisma.$transaction(async (tx) => {
    const transactions = moveTransactions
      ? await tx.transaction.updateMany({
          where: { categoryId: source.id },
          data: { categoryId: target.id },
        })
      : { count: 0 };
    const requests = moveRequests
      ? await tx.purchaseRequest.updateMany({
          where: { categoryId: source.id },
          data: { categoryId: target.id },
        })
      : { count: 0 };
    return { transactionCount: transactions.count, requestCount: requests.count };
  });

  await writeAuditLog({
    actor: auth.user,
    action: "category.reassign",
    entityType: "transaction_category",
    entityId: source.id,
    beforeData: { categoryId: source.id, categoryName: source.name },
    afterData: {
      categoryId: target.id,
      categoryName: target.name,
      scope: parsed.data.scope,
      ...result,
    },
  });

  return ok(result);
}
