import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { notificationQueue } from "@/lib/queue";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.submit");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing || existing.requesterId !== auth.user.id) {
    return forbidden();
  }

  const updated = await prisma.purchaseRequest.update({
    where: { id },
    data: { status: "PENDING_APPROVAL" },
  });

  await notificationQueue.add("request-submitted", {
    requestId: id,
    actorId: auth.user.id,
  });

  await writeAuditLog({
    actor: auth.user,
    action: "purchase_request.submit",
    entityType: "purchase_request",
    entityId: id,
    beforeData: existing,
    afterData: updated,
  });

  return ok({ row: updated });
}
