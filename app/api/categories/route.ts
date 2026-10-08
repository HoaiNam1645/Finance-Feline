import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getAccountantApprovalThresholdVnd } from "@/lib/settings";
import { DIEU_AM_CATEGORY_BRANCH_CODE, isDieuAmRole } from "@/lib/dieu-am-scope";

const schema = z.object({
  name: z.string().min(2),
  note: z.string().trim().max(255).optional(),
  contactEmail: z.string().trim().max(191).optional(),
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
      // Two nested parents cover the whole tree: the hierarchy is capped at 3 levels.
      parent: {
        select: {
          id: true,
          name: true,
          code: true,
          parentId: true,
          parent: { select: { id: true, name: true, code: true } },
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
  // Admins and accountants need the full catalog for reporting and maintenance. Staff
  // only receive their operational branch, which also keeps legacy roots out of pickers.
  const canSeeEveryBranch = auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");
  const scopedToDieuAm = isDieuAmRole(auth.user.roles) && !canSeeEveryBranch;
  const isWorkshopOnly =
    auth.user.roles.includes("WORKSHOP") &&
    !auth.user.roles.includes("EMPLOYEE") &&
    !auth.user.roles.includes("ACCOUNT");
  const visibleRootCode = canSeeEveryBranch || scopedToDieuAm ? null : isWorkshopOnly ? "SUPPLIER" : "FELINE";

  const rows = rawRows.map((row: (typeof rawRows)[number]) => {
    const grandParent = row.parent?.parent ?? null;
    const rootCode = grandParent?.code ?? row.parent?.code ?? row.code;
    const ancestors = [grandParent?.name, row.parent?.name].filter((name): name is string => Boolean(name));
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      note: row.note,
      contactEmail: row.contactEmail,
      type: row.type,
      parentId: row.parentId,
      parentName: row.parent?.name ?? null,
      parentCode: row.parent?.code ?? null,
      grandParentCode: grandParent?.code ?? null,
      rootId: grandParent?.id ?? row.parent?.id ?? row.id,
      rootCode,
      rootName: grandParent?.name ?? row.parent?.name ?? row.name,
      level: ancestors.length + 1,
      path: [...ancestors, row.name],
      pathLabel: [...ancestors, row.name].join(" / "),
      isActive: row.isActive,
      accountantApprovalThresholdVnd: row.accountantApprovalThresholdVnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      transactionCount: row._count.transactions,
      childCount: row._count.children,
    };
  });

  const visibleRows = scopedToDieuAm
    ? rows.filter(
        (row) =>
          row.code === DIEU_AM_CATEGORY_BRANCH_CODE ||
          row.parentCode === DIEU_AM_CATEGORY_BRANCH_CODE ||
          row.grandParentCode === DIEU_AM_CATEGORY_BRANCH_CODE
      )
    : visibleRootCode
      ? rows.filter((row) => row.rootCode === visibleRootCode)
      : rows;

  return ok({ rows: visibleRows });
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
      select: { id: true, parentId: true, parent: { select: { parentId: true } } },
    });
    if (!parent) {
      return fail("Danh mục cha không hợp lệ", 400);
    }
    if (parent.parent?.parentId) {
      return fail("Chỉ hỗ trợ tối đa 3 cấp danh mục", 400);
    }
  }

  const duplicatedName = await prisma.transactionCategory.findFirst({
    where: {
      name: {
        equals: normalizedName,
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
      note: parsed.data.note?.trim() || null,
      contactEmail: parsed.data.contactEmail?.trim() || null,
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
