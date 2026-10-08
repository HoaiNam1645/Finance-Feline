import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { deleteReceiptFile, mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";

const updateSchema = z.object({
  walletPaymentAccountId: z.string().trim().min(1),
  receivePaymentAccountId: z.string().trim().min(1),
  amountUsd: z.number().positive(),
  amountVnd: z.number().positive(),
  notes: z.string().trim().max(1000).optional(),
  transferTransactionId: z.string().trim().max(191).optional(),
  receiveTransactionId: z.string().trim().max(191).optional(),
  createdAt: z.date(),
  // A conversion can be recorded before any purchase request is attached to it.
  requestIds: z.array(z.string().min(1)).optional().default([]),
});

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type SavedReceiptFile = { filePath: string; fileName: string; mimeType: string; size: number };

function parseOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function parseNumberInput(value: FormDataEntryValue | null) {
  const numberValue = Number(String(value ?? ""));
  return Number.isFinite(numberValue) ? numberValue : NaN;
}

function parseDateInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseRequestIds(formData: FormData) {
  const repeated = formData.getAll("requestIds").map((value) => String(value).trim()).filter(Boolean);
  if (repeated.length > 0) return repeated;

  const raw = String(formData.get("requestIdsJson") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value).trim()).filter(Boolean);
    }
  } catch {
    return [];
  }
  return [];
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return fail("Payload phải là form-data", 400);
  }

  const { id } = await params;
  const before = await prisma.currencyConversion.findUnique({
    where: { id },
    include: { requests: { select: { purchaseRequestId: true } } },
  });
  if (!before) {
    return fail("Phiếu quy đổi không tồn tại", 404);
  }

  const formData = await request.formData();
  const parsed = updateSchema.safeParse({
    walletPaymentAccountId: formData.get("walletPaymentAccountId"),
    receivePaymentAccountId: formData.get("receivePaymentAccountId"),
    amountUsd: parseNumberInput(formData.get("amountUsd")),
    amountVnd: parseNumberInput(formData.get("amountVnd")),
    notes: parseOptionalText(formData.get("notes")),
    transferTransactionId: parseOptionalText(formData.get("transferTransactionId")),
    receiveTransactionId: parseOptionalText(formData.get("receiveTransactionId")),
    createdAt: parseDateInput(formData.get("createdAt")),
    requestIds: Array.from(new Set(parseRequestIds(formData))),
  });
  if (!parsed.success) {
    return fail("Thông tin quy đổi không hợp lệ", 400);
  }

  const walletAccount = await prisma.paymentAccount.findFirst({
    where: { id: parsed.data.walletPaymentAccountId, bankName: "PingPong", isActive: true },
    select: { id: true, accountName: true },
  });
  if (!walletAccount) {
    return fail("Vui lòng chọn ví PingPong hợp lệ trong tài khoản thanh toán", 400);
  }

  const receiveAccount = await prisma.paymentAccount.findFirst({
    where: { id: parsed.data.receivePaymentAccountId, bankName: { not: "PingPong" }, isActive: true },
    select: { id: true, bankName: true, accountNumber: true, ownerName: true },
  });
  if (!receiveAccount) {
    return fail("Vui lòng chọn tài khoản nhận hợp lệ (không phải ví PingPong)", 400);
  }

  // Requests already linked to this conversion keep their place whatever their status became
  // (an attached request moves on to PAID once the money goes out). Only newly added ones
  // have to be approved purchases that no other conversion has claimed.
  const linkedIds = new Set(before.requests.map((entry) => entry.purchaseRequestId));
  const addedIds = parsed.data.requestIds.filter((requestId) => !linkedIds.has(requestId));
  if (addedIds.length) {
    const addedRequests = await prisma.purchaseRequest.findMany({
      where: {
        id: { in: addedIds },
        kind: "PURCHASE",
        status: "APPROVED",
        currencyConversions: { none: {} },
      },
      select: { id: true },
    });
    if (addedRequests.length !== addedIds.length) {
      return fail("Chỉ được chọn yêu cầu mua đã duyệt, đang chờ chuyển khoản và chưa gắn phiếu quy đổi khác", 400);
    }
  }

  const pingpongImage = formData.get("pingpongImage");
  const transferImage = formData.get("transferImage");
  const hasNewPingpongImage = pingpongImage instanceof File && pingpongImage.size > 0;
  const hasNewTransferImage = transferImage instanceof File && transferImage.size > 0;
  const removeTransferImage = String(formData.get("removeTransferImage") ?? "") === "true";

  let savedPingpongImage: SavedReceiptFile | undefined;
  let savedTransferImage: SavedReceiptFile | undefined;
  try {
    if (hasNewPingpongImage) {
      savedPingpongImage = (await saveReceiptFiles([pingpongImage]))[0];
    }
    if (hasNewTransferImage) {
      savedTransferImage = (await saveReceiptFiles([transferImage]))[0];
    }
  } catch (error) {
    const message = mapReceiptStorageError(error);
    if (message) return fail(message, 400);
    throw error;
  }

  const nextRequestIds = new Set(parsed.data.requestIds);
  const removedRequestIds = [...linkedIds].filter((requestId) => !nextRequestIds.has(requestId));
  const addedRequestIds = addedIds;

  const row = await prisma.$transaction(async (tx: TxClient) => {
    if (removedRequestIds.length) {
      await tx.currencyConversionRequest.deleteMany({
        where: { conversionId: id, purchaseRequestId: { in: removedRequestIds } },
      });
    }
    if (addedRequestIds.length) {
      await tx.currencyConversionRequest.createMany({
        data: addedRequestIds.map((purchaseRequestId) => ({ conversionId: id, purchaseRequestId })),
      });
    }

    return tx.currencyConversion.update({
      where: { id },
      data: {
        walletPaymentAccount: { connect: { id: walletAccount.id } },
        receivePaymentAccount: { connect: { id: receiveAccount.id } },
        walletName: walletAccount.accountName,
        bankName: receiveAccount.bankName,
        accountNumber: receiveAccount.accountNumber,
        ownerName: receiveAccount.ownerName,
        amountUsd: parsed.data.amountUsd,
        amountVnd: parsed.data.amountVnd,
        notes: parsed.data.notes ?? null,
        transferTransactionId: parsed.data.transferTransactionId ?? null,
        receiveTransactionId: parsed.data.receiveTransactionId ?? null,
        createdAt: parsed.data.createdAt,
        ...(savedPingpongImage
          ? {
              pingpongImagePath: savedPingpongImage.filePath,
              pingpongImageName: savedPingpongImage.fileName,
              pingpongImageMimeType: savedPingpongImage.mimeType,
              pingpongImageSize: savedPingpongImage.size,
            }
          : {}),
        ...(savedTransferImage
          ? {
              transferImagePath: savedTransferImage.filePath,
              transferImageName: savedTransferImage.fileName,
              transferImageMimeType: savedTransferImage.mimeType,
              transferImageSize: savedTransferImage.size,
            }
          : removeTransferImage
            ? {
                transferImagePath: null,
                transferImageName: null,
                transferImageMimeType: null,
                transferImageSize: null,
              }
            : {}),
      },
      include: {
        requests: {
          include: {
            purchaseRequest: {
              select: { id: true, title: true, expectedAmount: true, currencyCode: true },
            },
          },
        },
      },
    });
  });

  const replacedFilePaths = [
    savedPingpongImage ? before.pingpongImagePath : null,
    savedTransferImage || removeTransferImage ? before.transferImagePath : null,
  ].filter((filePath): filePath is string => Boolean(filePath));
  for (const filePath of replacedFilePaths) {
    await deleteReceiptFile(filePath).catch((error) => {
      console.error("[currency-conversion] delete replaced image failed", error);
    });
  }

  await writeAuditLog({
    actor: auth.user,
    action: "currency_conversion.update",
    entityType: "currency_conversion",
    entityId: id,
    beforeData: before,
    afterData: row,
  });

  return ok({ row });
}
