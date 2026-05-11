import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const SPECIAL_DELETE_EMAIL = "ngobao@bugmedia.vn";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  if (auth.user.email.toLowerCase() !== SPECIAL_DELETE_EMAIL) {
    return forbidden();
  }

  const { id } = await params;
  const current = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      transactions: {
        select: { id: true },
        take: 1,
      },
      receiptImages: {
        select: {
          id: true,
          filePath: true,
          fileName: true,
          createdAt: true,
        },
      },
      items: true,
      approvals: true,
    },
  });

  if (!current) {
    return fail("Yêu cầu mua không tồn tại", 404);
  }

  if (current.transactions.length > 0) {
    return fail("Không thể xóa yêu cầu mua đã có giao dịch thanh toán", 409);
  }

  await prisma.purchaseRequest.delete({ where: { id } });

  await writeAuditLog({
    actor: auth.user,
    action: "purchase_request.delete",
    entityType: "purchase_request",
    entityId: id,
    beforeData: current,
  });

  return ok({ id });
}
