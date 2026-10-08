import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  action: z.literal("cancel"),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Thao tác không hợp lệ", 400);
  }

  const before = await prisma.externalReceivable.findUnique({
    where: { id },
    include: { payments: { select: { id: true } } },
  });
  if (!before) {
    return fail("Không tìm thấy công nợ", 404);
  }
  if (before.status === "CANCELLED") {
    return ok({ row: before });
  }
  if (before.payments.length > 0) {
    return fail("Không thể hủy công nợ đã có lịch sử thu tiền", 400);
  }

  const row = await prisma.externalReceivable.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "external_receivable.cancel",
    entityType: "ExternalReceivable",
    entityId: row.id,
    beforeData: before,
    afterData: row,
  });

  return ok({ row });
}
