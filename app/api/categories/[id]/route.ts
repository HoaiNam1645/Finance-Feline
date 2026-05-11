import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  parentId: z.preprocess((value) => (value === "" || value == null ? null : value), z.string().min(1).nullable().optional()),
  accountantApprovalThresholdVnd: z.number().int().positive().optional(),
});

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("category.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }
  if (
    typeof parsed.data.name === "undefined" &&
    typeof parsed.data.type === "undefined" &&
    typeof parsed.data.parentId === "undefined" &&
    typeof parsed.data.accountantApprovalThresholdVnd === "undefined"
  ) {
    return fail("Không có dữ liệu cập nhật", 400);
  }

  const { id } = await params;
  const before = await prisma.transactionCategory.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, children: true } } },
  });
  if (!before) {
    return fail("Danh mục không tồn tại", 404);
  }

  const hasTransactions = before._count.transactions > 0;
  if (hasTransactions) {
    const hasNameChange = typeof parsed.data.name !== "undefined";
    const hasTypeChange = typeof parsed.data.type !== "undefined";
    const hasParentChange = typeof parsed.data.parentId !== "undefined";
    const hasThresholdChange = typeof parsed.data.accountantApprovalThresholdVnd === "number";

    if (hasNameChange || hasTypeChange || hasParentChange) {
      return fail("Danh mục đã có giao dịch nên chỉ được cập nhật ngưỡng duyệt kế toán", 409);
    }
    if (!hasThresholdChange) {
      return fail("Không có dữ liệu cập nhật", 400);
    }
    if (!auth.user.roles.includes("ADMIN")) {
      return fail("Chỉ ADMIN được cập nhật ngưỡng duyệt cho danh mục đã có giao dịch", 403);
    }
  }

  const nextName = typeof parsed.data.name === "string" ? normalizeCategoryName(parsed.data.name) : before.name;
  if (nextName.length < 2) {
    return fail("Tên danh mục không hợp lệ", 400);
  }

  if (nextName.toLowerCase() !== before.name.toLowerCase()) {
    const duplicatedName = await prisma.transactionCategory.findFirst({
      where: {
        id: { not: id },
        name: {
          equals: nextName,
        },
      },
      select: { id: true },
    });
    if (duplicatedName) {
      return fail("Tên danh mục đã tồn tại", 409);
    }
  }

  let nextParentId = before.parentId;
  if (typeof parsed.data.parentId !== "undefined") {
    nextParentId = parsed.data.parentId;
  }
  if (nextParentId === id) {
    return fail("Danh mục không thể là cha của chính nó", 400);
  }
  if (nextParentId) {
    const parent = await prisma.transactionCategory.findUnique({
      where: { id: nextParentId },
      select: { id: true, type: true, parentId: true, isActive: true },
    });
    if (!parent || !parent.isActive) {
      return fail("Danh mục cha không hợp lệ", 400);
    }
    const nextType = hasTransactions ? before.type : parsed.data.type ?? before.type;
    if (parent.type !== nextType) {
      return fail("Danh mục con phải cùng loại với danh mục cha", 400);
    }
    if (parent.parentId) {
      return fail("Chỉ hỗ trợ 1 cấp danh mục con", 400);
    }
  }
  if (before._count.children > 0 && nextParentId) {
    return fail("Danh mục cha đang có danh mục con, không thể đổi thành danh mục con", 409);
  }

  const row = await prisma.transactionCategory.update({
    where: { id },
    data: {
      name: hasTransactions ? before.name : nextName,
      type: hasTransactions ? before.type : parsed.data.type ?? before.type,
      ...(hasTransactions ? {} : { parentId: nextParentId }),
      accountantApprovalThresholdVnd:
        typeof parsed.data.accountantApprovalThresholdVnd === "number"
          ? parsed.data.accountantApprovalThresholdVnd
          : before.accountantApprovalThresholdVnd,
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "category.update",
    entityType: "transaction_category",
    entityId: row.id,
    beforeData: before,
    afterData: row,
  });

  return ok({ row });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("category.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const before = await prisma.transactionCategory.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true, children: true } } },
  });
  if (!before) {
    return fail("Danh mục không tồn tại", 404);
  }
  if (before._count.transactions > 0) {
    return fail("Danh mục đã có giao dịch nên không thể xóa", 409);
  }
  if (before._count.children > 0) {
    return fail("Danh mục đang có danh mục con nên không thể xóa", 409);
  }

  await prisma.$transaction([
    prisma.purchaseRequest.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    }),
    prisma.transactionCategory.delete({ where: { id } }),
  ]);

  await writeAuditLog({
    actor: auth.user,
    action: "category.delete",
    entityType: "transaction_category",
    entityId: id,
    beforeData: before,
    afterData: null,
  });

  return ok({ deleted: true, id });
}
