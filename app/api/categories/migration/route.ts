import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getAccountantApprovalThresholdVnd } from "@/lib/settings";

const COMPLETED_KEY = "CATEGORY_MIGRATION_COMPLETED";

const TARGET_EXPENSE_CATEGORIES = [
  { code: "EXPENSE_FIXED", name: "CHI PHÍ CỐ ĐỊNH" },
  { code: "EXPENSE_OPERATION", name: "CHI PHÍ VẬN HÀNH" },
  { code: "EXPENSE_EQUIPMENT", name: "CHI PHÍ THIẾT BỊ, VẬT PHẨM" },
  { code: "EXPENSE_HR", name: "CHI PHÍ NHÂN SỰ" },
  { code: "EXPENSE_ACCOUNT", name: "CHI PHÍ ACCOUNT" },
  { code: "EXPENSE_ADS", name: "CHI PHÍ ADS" },
  { code: "EXPENSE_OTHER", name: "CHI PHÍ KHÁC" },
] as const;

const applySchema = z.object({
  mappings: z
    .array(
      z.object({
        oldCategoryId: z.string().min(1),
        newCategoryId: z.string().min(1),
      }),
    )
    .min(1),
});

type MigrationSummary = {
  oldCategoryId: string;
  oldCategoryName: string;
  newCategoryId: string;
  newCategoryName: string;
  transactionCount: number;
  requestCount: number;
  amountVnd: number;
};

async function getCompleted() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: COMPLETED_KEY },
    select: { value: true },
  });
  return setting?.value === "true";
}

async function ensureTargetCategories() {
  const defaultThresholdVnd = await getAccountantApprovalThresholdVnd();
  const rows = [];

  for (const category of TARGET_EXPENSE_CATEGORIES) {
    const existingByCode = await prisma.transactionCategory.findUnique({
      where: { code: category.code },
    });

    if (existingByCode) {
      rows.push(
        await prisma.transactionCategory.update({
          where: { id: existingByCode.id },
          data: {
            name: category.name,
            type: "EXPENSE",
            parentId: null,
            isActive: true,
            accountantApprovalThresholdVnd:
              existingByCode.accountantApprovalThresholdVnd ?? defaultThresholdVnd,
          },
          select: { id: true, code: true, name: true },
        }),
      );
      continue;
    }

    const existingByName = await prisma.transactionCategory.findFirst({
      where: {
        name: category.name,
        type: "EXPENSE",
        parentId: null,
      },
    });

    if (existingByName) {
      rows.push(
        await prisma.transactionCategory.update({
          where: { id: existingByName.id },
          data: {
            isActive: true,
            accountantApprovalThresholdVnd:
              existingByName.accountantApprovalThresholdVnd ?? defaultThresholdVnd,
          },
          select: { id: true, code: true, name: true },
        }),
      );
      continue;
    }

    rows.push(
      await prisma.transactionCategory.create({
        data: {
          code: category.code,
          name: category.name,
          type: "EXPENSE",
          accountantApprovalThresholdVnd: defaultThresholdVnd,
        },
        select: { id: true, code: true, name: true },
      }),
    );
  }

  return rows;
}

async function loadMigrationData() {
  const newCategories = await ensureTargetCategories();
  const newCategoryIds = new Set(newCategories.map((category) => category.id));

  const oldCategories = await prisma.transactionCategory.findMany({
    where: {
      type: "EXPENSE",
      isActive: true,
      id: { notIn: [...newCategoryIds] },
    },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          transactions: true,
          requests: true,
        },
      },
      transactions: {
        take: 3,
        orderBy: { transactionDate: "desc" },
        select: {
          id: true,
          amountVnd: true,
          description: true,
          transactionDate: true,
        },
      },
    },
  });

  const totals = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      categoryId: {
        in: oldCategories.map((category) => category.id),
      },
    },
    _sum: {
      amountVnd: true,
    },
  });
  const totalByCategory = new Map(totals.map((row) => [row.categoryId, Number(row._sum.amountVnd ?? 0)]));

  return {
    oldCategories: oldCategories.map((category) => ({
      id: category.id,
      code: category.code,
      name: category.name,
      transactionCount: category._count.transactions,
      requestCount: category._count.requests,
      amountVnd: totalByCategory.get(category.id) ?? 0,
      samples: category.transactions.map((transaction) => ({
        id: transaction.id,
        amountVnd: Number(transaction.amountVnd),
        description: transaction.description,
        transactionDate: transaction.transactionDate,
      })),
    })),
    newCategories,
  };
}

export async function GET() {
  const auth = await requireApiUser("category.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const [completed, data] = await Promise.all([getCompleted(), loadMigrationData()]);

  return ok({
    completed,
    ...data,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("category.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  if (await getCompleted()) {
    return fail("Migration danh mục đã được xác nhận", 409);
  }

  const body = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload mapping không hợp lệ", 400);
  }

  const { oldCategories, newCategories } = await loadMigrationData();
  if (oldCategories.length === 0) {
    return fail("Không còn danh mục chi phí cũ cần map", 400);
  }

  const oldIds = new Set(oldCategories.map((category) => category.id));
  const newIds = new Set(newCategories.map((category) => category.id));
  const uniqueOldIds = new Set(parsed.data.mappings.map((mapping) => mapping.oldCategoryId));

  if (uniqueOldIds.size !== oldIds.size || [...oldIds].some((id) => !uniqueOldIds.has(id))) {
    return fail("Cần map đầy đủ tất cả danh mục chi phí cũ trước khi xác nhận", 400);
  }

  for (const mapping of parsed.data.mappings) {
    if (!oldIds.has(mapping.oldCategoryId) || !newIds.has(mapping.newCategoryId)) {
      return fail("Mapping có danh mục không hợp lệ", 400);
    }
  }

  const mappingByOldId = new Map(parsed.data.mappings.map((mapping) => [mapping.oldCategoryId, mapping.newCategoryId]));
  const summary: MigrationSummary[] = [];

  await prisma.$transaction(async (tx) => {
    for (const oldCategory of oldCategories) {
      const newCategoryId = mappingByOldId.get(oldCategory.id);
      if (!newCategoryId) continue;

      const [transactionResult, requestResult] = await Promise.all([
        tx.transaction.updateMany({
          where: { categoryId: oldCategory.id },
          data: { categoryId: newCategoryId },
        }),
        tx.purchaseRequest.updateMany({
          where: { categoryId: oldCategory.id },
          data: { categoryId: newCategoryId },
        }),
      ]);

      await tx.transactionCategory.update({
        where: { id: oldCategory.id },
        data: { isActive: false },
      });

      const newCategory = newCategories.find((category) => category.id === newCategoryId);
      summary.push({
        oldCategoryId: oldCategory.id,
        oldCategoryName: oldCategory.name,
        newCategoryId,
        newCategoryName: newCategory?.name ?? "",
        transactionCount: transactionResult.count,
        requestCount: requestResult.count,
        amountVnd: oldCategory.amountVnd,
      });
    }

    await tx.appSetting.upsert({
      where: { key: COMPLETED_KEY },
      update: { value: "true" },
      create: { key: COMPLETED_KEY, value: "true" },
    });
  });

  await writeAuditLog({
    actor: auth.user,
    action: "category.migration.apply",
    entityType: "transaction_category",
    entityId: "CATEGORY_MIGRATION",
    afterData: summary,
  });

  return ok({ completed: true, summary });
}
