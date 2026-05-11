import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { deleteReceiptFile } from "@/lib/receipt-storage";

const SPECIAL_DELETE_EMAIL = "ngobao@bugmedia.vn";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> }
) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }
  const canDeleteByPermission = hasPermission(auth.user.roles, "request.pay");
  const canDeleteBySpecialEmail = auth.user.email.toLowerCase() === SPECIAL_DELETE_EMAIL;
  if (!canDeleteByPermission && !canDeleteBySpecialEmail) {
    return forbidden();
  }

  const { id, receiptId } = await params;
  const receipt = await prisma.receiptImage.findFirst({
    where: { id: receiptId, purchaseRequestId: id },
  });

  if (!receipt) {
    return fail("Ảnh chứng từ không tồn tại", 404);
  }

  await prisma.receiptImage.delete({ where: { id: receipt.id } });
  await deleteReceiptFile(receipt.filePath);

  await writeAuditLog({
    actor: auth.user,
    action: "receipt_image.delete",
    entityType: "purchase_request",
    entityId: id,
    beforeData: { receiptId: receipt.id, filePath: receipt.filePath },
  });

  return ok({ success: true });
}
