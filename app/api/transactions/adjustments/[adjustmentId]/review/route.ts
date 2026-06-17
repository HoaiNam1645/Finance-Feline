import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(1000).optional(),
});

const payloadSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  // New adjustments store an array; older ones stored a single nullable teamUserId.
  teamUserIds: z.array(z.string()).optional(),
  teamUserId: z.string().nullable().optional(),
  categoryId: z.string(),
  amountOriginal: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
  exchangeRateToVnd: z.number().positive(),
  amountVnd: z.number().positive(),
  description: z.string().min(3),
  transactionDate: z.string().datetime(),
  paymentAccountId: z.string().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ adjustmentId: string }> }) {
  const auth = await requireApiUser("transaction.adjust.approve");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { adjustmentId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const adjustment = await prisma.transactionAdjustment.findUnique({
    where: { id: adjustmentId },
    include: {
      transaction: true,
    },
  });
  if (!adjustment) {
    return fail("Yêu cầu điều chỉnh không tồn tại", 404);
  }
  if (adjustment.status !== "PENDING") {
    return fail("Yêu cầu điều chỉnh đã được xử lý", 400);
  }

  const payloadParsed = payloadSchema.safeParse(adjustment.afterPayload ?? adjustment.payload);
  if (!payloadParsed.success) {
    return fail("Dữ liệu điều chỉnh không hợp lệ", 400);
  }
  const payload = payloadParsed.data;
  const teamUserIds = Array.from(
    new Set(payload.teamUserIds ?? (payload.teamUserId ? [payload.teamUserId] : []))
  );

  if (parsed.data.action === "REJECT") {
    const row = await prisma.transactionAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status: "REJECTED",
        approvedBy: auth.user.id,
        reviewNote: parsed.data.note,
        decidedAt: new Date(),
      },
    });

    await Promise.all([
      writeAuditLog({
        actor: auth.user,
        action: "transaction.adjustment.reject",
        entityType: "transaction",
        entityId: adjustment.transactionId,
        beforeData: {
          adjustmentId: adjustment.id,
          status: adjustment.status,
        },
        afterData: {
          adjustmentId: row.id,
          status: row.status,
          reviewNote: row.reviewNote,
          decidedAt: row.decidedAt,
        },
      }),
      writeAuditLog({
        actor: auth.user,
        action: "transaction.adjustment.reject",
        entityType: "transaction_adjustment",
        entityId: adjustment.id,
        beforeData: { status: adjustment.status },
        afterData: { status: row.status },
      }),
    ]);

    return ok({ row });
  }

  const result = await prisma.$transaction(async (tx: TxClient) => {
    const updatedTransaction = await tx.transaction.update({
      where: { id: adjustment.transactionId },
      data: {
        direction: payload.direction,
        teamUsers: { deleteMany: {}, create: teamUserIds.map((userId) => ({ userId })) },
        categoryId: payload.categoryId,
        amountOriginal: payload.amountOriginal,
        currencyCode: payload.currencyCode,
        exchangeRateToVnd: payload.exchangeRateToVnd,
        amountVnd: payload.amountVnd,
        description: payload.description,
        transactionDate: new Date(payload.transactionDate),
        paymentAccountId: payload.paymentAccountId,
        approvedBy: auth.user.id,
      },
    });

    const updatedAdjustment = await tx.transactionAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status: "APPROVED",
        approvedBy: auth.user.id,
        reviewNote: parsed.data.note,
        decidedAt: new Date(),
      },
    });

    return { updatedTransaction, updatedAdjustment };
  });

  await Promise.all([
    writeAuditLog({
      actor: auth.user,
      action: "transaction.adjustment.approve",
      entityType: "transaction",
      entityId: adjustment.transactionId,
      beforeData: {
        adjustmentId: adjustment.id,
        adjustmentStatus: adjustment.status,
        transaction: adjustment.transaction,
      },
      afterData: {
        adjustmentId: result.updatedAdjustment.id,
        adjustmentStatus: result.updatedAdjustment.status,
        transaction: result.updatedTransaction,
      },
    }),
    writeAuditLog({
      actor: auth.user,
      action: "transaction.adjustment.approve",
      entityType: "transaction_adjustment",
      entityId: adjustment.id,
      beforeData: { status: adjustment.status },
      afterData: { status: result.updatedAdjustment.status },
    }),
  ]);

  return ok({ row: result.updatedAdjustment, transaction: result.updatedTransaction });
}
