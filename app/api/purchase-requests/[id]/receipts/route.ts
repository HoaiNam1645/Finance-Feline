import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const purchaseRequest = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!purchaseRequest) {
    return fail("Yêu cầu không tồn tại", 404);
  }

  const formData = await request.formData();
  const incoming = formData.getAll("receiptFiles");
  const files: File[] = [];
  for (const item of incoming) {
    if (item instanceof File && item.size > 0) {
      files.push(item);
    }
  }

  if (files.length === 0) {
    return fail("Vui lòng chọn ít nhất 1 ảnh chứng từ", 400);
  }

  let saved: Array<{ filePath: string; fileName: string; mimeType: string; size: number }> = [];
  try {
    saved = await saveReceiptFiles(files);
  } catch (error) {
    const message = mapReceiptStorageError(error);
    if (message) {
      return fail(message, 400);
    }
    throw error;
  }
  const created = await prisma.$transaction(async (tx: TxClient) => {
    await tx.receiptImage.createMany({
      data: saved.map((file) => ({
        purchaseRequestId: id,
        uploadedBy: auth.user.id,
        transactionId: null,
        filePath: file.filePath,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
      })),
    });

    return tx.receiptImage.findMany({
      where: { purchaseRequestId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, filePath: true, fileName: true, createdAt: true },
    });
  });

  await writeAuditLog({
    actor: auth.user,
    action: "receipt_image.create",
    entityType: "purchase_request",
    entityId: id,
    afterData: { receiptCountAdded: saved.length },
  });

  return ok({ rows: created }, 201);
}
