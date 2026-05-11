import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { notificationQueue } from "@/lib/queue";
import { getAccountantApprovalThresholdVnd } from "@/lib/settings";

const schema = z.object({ note: z.string().min(2).max(500).optional() });
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.approve");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const { id } = await params;
  const before = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!before) {
    return fail("Request không tồn tại", 404);
  }
  if (before.status !== "PENDING_APPROVAL") {
    return fail("Chỉ được duyệt yêu cầu đang chờ duyệt", 400);
  }

  const isAdmin = auth.user.roles.includes("ADMIN");
  const isAccountant = auth.user.roles.includes("ACCOUNTANT");
  if (!isAdmin) {
    if (!isAccountant) {
      return forbidden();
    }
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
      return fail(
        `Kế toán chỉ được duyệt yêu cầu tối đa ${thresholdVnd.toLocaleString("vi-VN")} VND`,
        403
      );
    }
  }

  let updated = null;
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
          actorId: auth.user.id,
          note: parsed.data.note ?? "Approved",
        },
      });

      return tx.purchaseRequest.findUnique({ where: { id } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_STATUS_CHANGED") {
      return fail("Yêu cầu đã đổi trạng thái, vui lòng tải lại", 409);
    }
    throw error;
  }
  if (!updated) {
    return fail("Không thể cập nhật yêu cầu", 500);
  }

  await notificationQueue.add("request-approved", { requestId: id, actorId: auth.user.id });

  await writeAuditLog({
    actor: auth.user,
    action: "purchase_request.approve",
    entityType: "purchase_request",
    entityId: id,
    beforeData: before,
    afterData: updated,
  });

  return ok({ row: updated });
}
