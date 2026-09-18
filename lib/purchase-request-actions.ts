import type { PurchaseRequest } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { notificationQueue } from "@/lib/queue";
import { getAccountantApprovalThresholdVnd } from "@/lib/settings";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export class PurchaseRequestActionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function hasRole(actor: SessionUser, role: string) {
  return actor.roles.includes(role);
}

export async function approvePurchaseRequest(input: {
  id: string;
  actor: SessionUser;
  note?: string;
  auditAction?: string;
}) {
  const { id, actor } = input;
  if (!hasRole(actor, "ADMIN") && !hasRole(actor, "ACCOUNTANT")) {
    throw new PurchaseRequestActionError("Bạn không có quyền duyệt yêu cầu", 403);
  }

  const before = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!before) {
    throw new PurchaseRequestActionError("Request không tồn tại", 404);
  }
  if (before.status !== "PENDING_APPROVAL") {
    throw new PurchaseRequestActionError("Chỉ được duyệt yêu cầu đang chờ duyệt", 400);
  }

  if (!hasRole(actor, "ADMIN")) {
    const defaultThresholdVnd = await getAccountantApprovalThresholdVnd();
    const category = before.categoryId
      ? await prisma.transactionCategory.findUnique({
          where: { id: before.categoryId },
          select: { accountantApprovalThresholdVnd: true },
        })
      : null;
    const thresholdVnd = category?.accountantApprovalThresholdVnd ?? defaultThresholdVnd;
    const exchangeRate = before.currencyCode === "USD" ? env.defaultUsdToVnd : 1;
    const amountVnd = Number(before.expectedAmount) * exchangeRate;
    if (amountVnd > thresholdVnd) {
      throw new PurchaseRequestActionError(
        `Kế toán chỉ được duyệt yêu cầu tối đa ${thresholdVnd.toLocaleString("vi-VN")} VND`,
        403,
      );
    }
  }

  let updated: PurchaseRequest | null = null;
  try {
    updated = await prisma.$transaction(async (tx: TxClient) => {
      const changed = await tx.purchaseRequest.updateMany({
        where: {
          id,
          status: "PENDING_APPROVAL",
        },
        data: { status: "APPROVED" },
      });
      if (changed.count === 0) {
        throw new Error("REQUEST_STATUS_CHANGED");
      }

      await tx.purchaseRequestApproval.create({
        data: {
          requestId: id,
          action: "APPROVE",
          actorId: actor.id,
          note: input.note ?? "Approved",
        },
      });

      return tx.purchaseRequest.findUnique({ where: { id } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_STATUS_CHANGED") {
      throw new PurchaseRequestActionError("Yêu cầu đã đổi trạng thái, vui lòng tải lại", 409);
    }
    throw error;
  }

  if (!updated) {
    throw new PurchaseRequestActionError("Không thể cập nhật yêu cầu", 500);
  }

  await notificationQueue.add("request-approved", { requestId: id, actorId: actor.id });

  await writeAuditLog({
    actor,
    action: input.auditAction ?? "purchase_request.approve",
    entityType: "purchase_request",
    entityId: id,
    beforeData: before,
    afterData: updated,
  });

  return updated;
}

export async function rejectPurchaseRequest(input: {
  id: string;
  actor: SessionUser;
  note: string;
  auditAction?: string;
}) {
  const { id, actor } = input;
  if (!hasRole(actor, "ADMIN")) {
    throw new PurchaseRequestActionError("Bạn không có quyền từ chối yêu cầu", 403);
  }

  const before = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!before) {
    throw new PurchaseRequestActionError("Request không tồn tại", 404);
  }
  if (before.status !== "PENDING_APPROVAL") {
    throw new PurchaseRequestActionError("Chỉ được từ chối yêu cầu đang chờ duyệt", 400);
  }

  let updated: PurchaseRequest | null = null;
  try {
    updated = await prisma.$transaction(async (tx: TxClient) => {
      const changed = await tx.purchaseRequest.updateMany({
        where: {
          id,
          status: "PENDING_APPROVAL",
        },
        data: { status: "REJECTED" },
      });
      if (changed.count === 0) {
        throw new Error("REQUEST_STATUS_CHANGED");
      }

      await tx.purchaseRequestApproval.create({
        data: {
          requestId: id,
          action: "REJECT",
          actorId: actor.id,
          note: input.note,
        },
      });

      return tx.purchaseRequest.findUnique({ where: { id } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_STATUS_CHANGED") {
      throw new PurchaseRequestActionError("Yêu cầu đã đổi trạng thái, vui lòng tải lại", 409);
    }
    throw error;
  }

  if (!updated) {
    throw new PurchaseRequestActionError("Không thể cập nhật yêu cầu", 500);
  }

  await notificationQueue.add("request-rejected", {
    requestId: id,
    actorId: actor.id,
    note: input.note,
  });

  await writeAuditLog({
    actor,
    action: input.auditAction ?? "purchase_request.reject",
    entityType: "purchase_request",
    entityId: id,
    beforeData: before,
    afterData: updated,
  });

  return updated;
}
