import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createAdjustmentSchema = z.object({
  teamUserId: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).optional()),
  categoryId: z.string().min(1),
  amountOriginal: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
  description: z.string().min(3),
  transactionDate: z.string().datetime(),
  paymentAccountId: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).optional()),
  reason: z.string().trim().min(5).max(1000),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("transaction.read");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }
  const canReadAllTransactions = auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");

  const { id } = await params;
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      teamUserId: true,
    },
  });
  if (!transaction) {
    return fail("Giao dịch không tồn tại", 404);
  }
  if (!canReadAllTransactions && transaction.teamUserId !== auth.user.id) {
    return fail("Giao dịch không tồn tại", 404);
  }

  const rows = await prisma.transactionAdjustment.findMany({
    where: { transactionId: id },
    orderBy: { requestedAt: "desc" },
    include: {
      requester: { select: { id: true, fullName: true, email: true } },
      approver: { select: { id: true, fullName: true, email: true } },
    },
  });

  return ok({ rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("transaction.adjust.request");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const current = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      direction: true,
      categoryId: true,
      teamUserId: true,
      amountOriginal: true,
      currencyCode: true,
      exchangeRateToVnd: true,
      amountVnd: true,
      description: true,
      transactionDate: true,
      paymentAccountId: true,
      status: true,
    },
  });
  if (!current) {
    return fail("Giao dịch không tồn tại", 404);
  }

  const pendingExists = await prisma.transactionAdjustment.findFirst({
    where: {
      transactionId: current.id,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (pendingExists) {
    return fail("Giao dịch đang có yêu cầu điều chỉnh chờ duyệt", 409);
  }

  const body = await request.json().catch(() => null);
  const parsed = createAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const category = await prisma.transactionCategory.findFirst({
    where: {
      id: parsed.data.categoryId,
      isActive: true,
    },
    select: { id: true, type: true },
  });
  if (!category) {
    return fail("Danh mục không hợp lệ", 400);
  }

  if (typeof parsed.data.teamUserId !== "undefined") {
    const teamUser = await prisma.user.findFirst({
      where: {
        id: parsed.data.teamUserId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!teamUser) {
      return fail("User team không hợp lệ", 400);
    }
  }

  if (typeof parsed.data.paymentAccountId !== "undefined") {
    const paymentAccount = await prisma.paymentAccount.findFirst({
      where: {
        id: parsed.data.paymentAccountId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!paymentAccount) {
      return fail("Tài khoản thanh toán không hợp lệ", 400);
    }
  }

  const direction = category.type === "INCOME" ? "IN" : "OUT";
  const exchangeRateToVnd = parsed.data.currencyCode === "USD" ? env.defaultUsdToVnd : 1;
  const amountVnd = parsed.data.amountOriginal * exchangeRateToVnd;
  const beforePayload = {
    direction: current.direction,
    teamUserId: current.teamUserId,
    categoryId: current.categoryId,
    amountOriginal: Number(current.amountOriginal),
    currencyCode: current.currencyCode,
    exchangeRateToVnd: Number(current.exchangeRateToVnd),
    amountVnd: Number(current.amountVnd),
    description: current.description,
    transactionDate: current.transactionDate.toISOString(),
    paymentAccountId: current.paymentAccountId,
  };
  const afterPayload = {
    direction,
    teamUserId: parsed.data.teamUserId ?? null,
    categoryId: parsed.data.categoryId,
    amountOriginal: parsed.data.amountOriginal,
    currencyCode: parsed.data.currencyCode,
    exchangeRateToVnd,
    amountVnd,
    description: parsed.data.description,
    transactionDate: parsed.data.transactionDate,
    paymentAccountId: parsed.data.paymentAccountId ?? null,
  };

  const include = {
    requester: { select: { id: true, fullName: true, email: true } },
    approver: { select: { id: true, fullName: true, email: true } },
  } as const;

  let row: Awaited<ReturnType<typeof prisma.transactionAdjustment.create>>;
  try {
    row = await prisma.transactionAdjustment.create({
      data: {
        transactionId: current.id,
        requestedBy: auth.user.id,
        reason: parsed.data.reason,
        beforePayload,
        afterPayload,
        payload: afterPayload,
      },
      include,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const needsLegacyFallback =
      message.includes("Unknown argument `beforePayload`") || message.includes("Unknown argument `afterPayload`");
    if (!needsLegacyFallback) {
      throw error;
    }

    // Fallback for environments still running an older Prisma client shape.
    row = await prisma.transactionAdjustment.create({
      data: {
        transactionId: current.id,
        requestedBy: auth.user.id,
        reason: parsed.data.reason,
        before_payload: beforePayload,
        after_payload: afterPayload,
        payload: afterPayload,
      } as never,
      include,
    });
  }

  await Promise.all([
    writeAuditLog({
      actor: auth.user,
      action: "transaction.adjustment.request",
      entityType: "transaction",
      entityId: current.id,
      beforeData: {
        transaction: current,
      },
      afterData: {
        adjustmentId: row.id,
        status: row.status,
        requestedAt: row.requestedAt,
        reason: row.reason,
      },
    }),
    writeAuditLog({
      actor: auth.user,
      action: "transaction.adjustment.request",
      entityType: "transaction_adjustment",
      entityId: row.id,
      beforeData: { transactionId: current.id },
      afterData: { status: row.status },
    }),
  ]);

  return ok({ row }, 201);
}
