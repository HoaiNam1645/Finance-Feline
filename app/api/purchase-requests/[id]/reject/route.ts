import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { notificationQueue } from "@/lib/queue";

const schema = z.object({ note: z.string().min(2).max(500) });
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.reject");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Vui lòng nhập lý do từ chối", 400);
  }

  const { id } = await params;
  const before = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!before) {
    return fail("Request không tồn tại", 404);
  }
  if (before.status !== "PENDING_APPROVAL") {
    return fail("Chỉ được từ chối yêu cầu đang chờ duyệt", 400);
  }

  let updated = null;
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
          actorId: auth.user.id,
          note: parsed.data.note,
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

  await notificationQueue.add("request-rejected", {
    requestId: id,
    actorId: auth.user.id,
    note: parsed.data.note,
  });

  await writeAuditLog({
    actor: auth.user,
    action: "purchase_request.reject",
    entityType: "purchase_request",
    entityId: id,
    beforeData: before,
    afterData: updated,
  });

  return ok({ row: updated });
}
