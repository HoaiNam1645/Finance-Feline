import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";
import { notifyCurrencyConversionCreated } from "@/lib/telegram";

const createSchema = z.object({
  walletPaymentAccountId: z.string().trim().min(1),
  receivePaymentAccountId: z.string().trim().min(1),
  amountUsd: z.number().positive(),
  amountVnd: z.number().positive(),
  notes: z.string().trim().max(1000).optional(),
  transferTransactionId: z.string().trim().max(191).optional(),
  receiveTransactionId: z.string().trim().max(191).optional(),
  // A conversion can be recorded before any purchase request is attached to it.
  requestIds: z.array(z.string().min(1)).optional().default([]),
});

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

function parseOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function parseNumberInput(value: FormDataEntryValue | null) {
  const numberValue = Number(String(value ?? ""));
  return Number.isFinite(numberValue) ? numberValue : NaN;
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

function normalizeReceiptPath(filePath: string | null) {
  if (!filePath) return filePath;
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) return filePath;
  if (filePath.startsWith("/")) return filePath;
  if (filePath.startsWith("public/")) return `/${filePath.replace(/^public\/+/, "")}`;
  return `/${filePath}`;
}

export async function GET() {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const rows = await prisma.currencyConversion.findMany({
    include: {
      creator: { select: { id: true, fullName: true, email: true } },
      decider: { select: { id: true, fullName: true, email: true } },
      walletPaymentAccount: {
        select: {
          id: true,
          accountName: true,
          bankName: true,
          accountNumber: true,
          ownerName: true,
        },
      },
      receivePaymentAccount: {
        select: {
          id: true,
          accountName: true,
          bankName: true,
          accountNumber: true,
          ownerName: true,
        },
      },
      requests: {
        include: {
          purchaseRequest: {
            select: {
              id: true,
              title: true,
              expectedAmount: true,
              currencyCode: true,
              status: true,
              requester: { select: { id: true, fullName: true, email: true } },
              category: {
                include: {
                  parent: { select: { name: true, parent: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const normalizedRows = rows.map((row: (typeof rows)[number]) => ({
    ...row,
    pingpongImagePath: normalizeReceiptPath(row.pingpongImagePath),
    transferImagePath: normalizeReceiptPath(row.transferImagePath),
    requests: row.requests.map((entry: (typeof row.requests)[number]) => ({
      ...entry,
      purchaseRequest: {
        ...entry.purchaseRequest,
        category: entry.purchaseRequest.category
          ? {
              ...entry.purchaseRequest.category,
              parentName: entry.purchaseRequest.category.parent?.name ?? null,
              pathLabel: [
                entry.purchaseRequest.category.parent?.parent?.name,
                entry.purchaseRequest.category.parent?.name,
                entry.purchaseRequest.category.name,
              ]
                .filter(Boolean)
                .join(" / "),
            }
          : null,
      },
    })),
  }));

  return ok({ rows: normalizedRows });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return fail("Payload phải là form-data", 400);
  }

  const formData = await request.formData();
  const parsed = createSchema.safeParse({
    walletPaymentAccountId: formData.get("walletPaymentAccountId"),
    receivePaymentAccountId: formData.get("receivePaymentAccountId"),
    amountUsd: parseNumberInput(formData.get("amountUsd")),
    amountVnd: parseNumberInput(formData.get("amountVnd")),
    notes: parseOptionalText(formData.get("notes")),
    transferTransactionId: parseOptionalText(formData.get("transferTransactionId")),
    receiveTransactionId: parseOptionalText(formData.get("receiveTransactionId")),
    requestIds: Array.from(new Set(parseRequestIds(formData))),
  });

  if (!parsed.success) {
    return fail("Thông tin quy đổi không hợp lệ", 400);
  }

  const walletAccount = await prisma.paymentAccount.findFirst({
    where: {
      id: parsed.data.walletPaymentAccountId,
      bankName: "PingPong",
      isActive: true,
    },
    select: {
      id: true,
      accountName: true,
    },
  });
  if (!walletAccount) {
    return fail("Vui lòng chọn ví PingPong hợp lệ trong tài khoản thanh toán", 400);
  }

  const receiveAccount = await prisma.paymentAccount.findFirst({
    where: {
      id: parsed.data.receivePaymentAccountId,
      bankName: { not: "PingPong" },
      isActive: true,
    },
    select: {
      id: true,
      bankName: true,
      accountNumber: true,
      ownerName: true,
    },
  });
  if (!receiveAccount) {
    return fail("Vui lòng chọn tài khoản nhận hợp lệ (không phải ví PingPong)", 400);
  }

  const pingpongImage = formData.get("pingpongImage");
  const transferImage = formData.get("transferImage");
  if (!(pingpongImage instanceof File) || pingpongImage.size <= 0) {
    return fail("Vui lòng tải ảnh ví PingPong", 400);
  }
  const hasTransferImage = transferImage instanceof File && transferImage.size > 0;

  const requests = await prisma.purchaseRequest.findMany({
    where: {
      id: { in: parsed.data.requestIds },
      kind: "PURCHASE",
      status: "APPROVED",
      currencyConversions: { none: {} },
    },
    select: {
      id: true,
      title: true,
      expectedAmount: true,
      currencyCode: true,
      status: true,
    },
  });
  if (requests.length !== parsed.data.requestIds.length) {
    return fail("Chỉ được chọn yêu cầu mua đã duyệt, đang chờ chuyển khoản và chưa gắn phiếu quy đổi", 400);
  }

  let savedPingpongImages: Array<{ filePath: string; fileName: string; mimeType: string; size: number }> = [];
  let savedTransferImages: Array<{ filePath: string; fileName: string; mimeType: string; size: number }> = [];
  try {
    savedPingpongImages = await saveReceiptFiles([pingpongImage]);
    savedTransferImages = hasTransferImage ? await saveReceiptFiles([transferImage]) : [];
  } catch (error) {
    const message = mapReceiptStorageError(error);
    if (message) return fail(message, 400);
    throw error;
  }

  const savedPingpongImage = savedPingpongImages[0];
  const savedTransferImage = savedTransferImages[0];
  if (!savedPingpongImage) {
    return fail("Ảnh tải lên không hợp lệ", 400);
  }

  const row = await prisma.$transaction(async (tx: TxClient) => {
    return tx.currencyConversion.create({
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
        pingpongImagePath: savedPingpongImage.filePath,
        pingpongImageName: savedPingpongImage.fileName,
        pingpongImageMimeType: savedPingpongImage.mimeType,
        pingpongImageSize: savedPingpongImage.size,
        transferImagePath: savedTransferImage?.filePath ?? null,
        transferImageName: savedTransferImage?.fileName ?? null,
        transferImageMimeType: savedTransferImage?.mimeType ?? null,
        transferImageSize: savedTransferImage?.size ?? null,
        creator: { connect: { id: auth.user.id } },
        requests: {
          create: requests.map((purchaseRequest) => ({
            purchaseRequestId: purchaseRequest.id,
          })),
        },
      },
      include: {
        requests: {
          include: {
            purchaseRequest: {
              select: {
                id: true,
                title: true,
                expectedAmount: true,
                currencyCode: true,
              },
            },
          },
        },
      },
    });
  });

  await writeAuditLog({
    actor: auth.user,
    action: "currency_conversion.create",
    entityType: "currency_conversion",
    entityId: row.id,
    afterData: row,
  });

  await notifyCurrencyConversionCreated(row.id).catch((error) => {
    console.error("[telegram] currency conversion notification failed", error);
  });

  return ok({ row }, 201);
}
