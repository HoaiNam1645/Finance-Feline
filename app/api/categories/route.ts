import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getAccountantApprovalThresholdVnd } from "@/lib/settings";

const schema = z.object({
  name: z.string().min(2),
  type: z.enum(["INCOME", "EXPENSE"]),
  parentId: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).optional()),
});

function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function toBaseCode(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase()
    .slice(0, 24) || "CATEGORY";
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const rawRows = await prisma.transactionCategory.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    include: {
      parent: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          transactions: true,
          children: true,
        },
      },
    },
  });
  const rows = rawRows.map((row: (typeof rawRows)[number]) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    parentName: row.parent?.name ?? null,
    isActive: row.isActive,
    accountantApprovalThresholdVnd: row.accountantApprovalThresholdVnd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    transactionCount: row._count.transactions,
    childCount: row._count.children,
  }));

  return ok({ rows });
}

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

  const normalizedName = normalizeCategoryName(parsed.data.name);
  if (normalizedName.length < 2) {
    return fail("Tên danh mục không hợp lệ", 400);
  }

  if (parsed.data.parentId) {
    const parent = await prisma.transactionCategory.findFirst({
      where: {
        id: parsed.data.parentId,
        isActive: true,
      },
      select: { id: true, type: true, parentId: true },
    });
    if (!parent) {
      return fail("Danh mục cha không hợp lệ", 400);
    }
    if (parent.type !== parsed.data.type) {
      return fail("Danh mục con phải cùng loại với danh mục cha", 400);
    }
    if (parent.parentId) {
      return fail("Chỉ hỗ trợ 1 cấp danh mục con", 400);
    }
  }

  const duplicatedName = await prisma.transactionCategory.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });
  if (duplicatedName) {
    return fail("Tên danh mục đã tồn tại", 409);
  }

  const base = toBaseCode(normalizedName);
  const samePrefix = await prisma.transactionCategory.findMany({
    where: { code: { startsWith: base } },
    select: { code: true },
  });
  const exists = new Set(samePrefix.map((item: (typeof samePrefix)[number]) => item.code));
  let finalCode = base;
  let count = 1;
  while (exists.has(finalCode)) {
    count += 1;
    finalCode = `${base}_${count}`;
  }
  const defaultThresholdVnd = await getAccountantApprovalThresholdVnd();

  const row = await prisma.transactionCategory.create({
    data: {
      code: finalCode,
      name: normalizedName,
      type: parsed.data.type,
      parentId: parsed.data.parentId ?? null,
      accountantApprovalThresholdVnd: defaultThresholdVnd,
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "category.create",
    entityType: "transaction_category",
    entityId: row.id,
    afterData: row,
  });

  return ok({ row }, 201);
}
