import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  categoryId: z.string().min(1),
});

// Re-filing a transaction under a different category does not change any amount,
// so it applies immediately instead of going through the adjustment approval flow.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("transaction.update");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const current = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, direction: true, categoryId: true, category: { select: { name: true } } },
  });
  if (!current) {
    return fail("Giao dịch không tồn tại", 404);
  }

  const category = await prisma.transactionCategory.findFirst({
    where: { id: parsed.data.categoryId, isActive: true },
    select: { id: true, name: true, type: true, _count: { select: { children: true } } },
  });
  if (!category) {
    return fail("Danh mục không hợp lệ", 400);
  }
  if (category._count.children > 0) {
    return fail("Vui lòng chọn danh mục con ở cấp sâu nhất", 400);
  }
  const expectedType = current.direction === "IN" ? "INCOME" : "EXPENSE";
  if (category.type !== expectedType) {
    return fail(current.direction === "IN" ? "Giao dịch thu phải chọn danh mục Thu" : "Giao dịch chi phải chọn danh mục Chi", 400);
  }
  if (category.id === current.categoryId) {
    return ok({ row: current });
  }

  const row = await prisma.transaction.update({
    where: { id },
    data: { categoryId: category.id },
    select: { id: true, categoryId: true },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "transaction.category.update",
    entityType: "transaction",
    entityId: id,
    beforeData: { categoryId: current.categoryId, categoryName: current.category?.name ?? null },
    afterData: { categoryId: category.id, categoryName: category.name },
  });

  return ok({ row });
}
