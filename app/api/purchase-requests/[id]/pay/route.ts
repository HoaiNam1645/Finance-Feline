import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { notificationQueue } from "@/lib/queue";
import { mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

function parseNumberInput(input: FormDataEntryValue | null) {
  const value = Number(String(input ?? ""));
  return Number.isFinite(value) ? value : NaN;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const receiptFiles: File[] = [];
  let paymentNote = "";
  let paymentAmount: number | null = null;
  let paymentCurrencyCode: "USD" | "VND" | null = null;
  let paymentAccountId: string | null = null;
  let paymentCategoryId: string | null = null;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const incoming = formData.getAll("receiptFiles");
    for (const item of incoming) {
      if (item instanceof File && item.size > 0) {
        receiptFiles.push(item);
      }
    }
    paymentNote = String(formData.get("paymentNote") ?? "");
    const parsedPaymentAmount = parseNumberInput(formData.get("paymentAmount"));
    if (Number.isFinite(parsedPaymentAmount) && parsedPaymentAmount > 0) {
      paymentAmount = parsedPaymentAmount;
    }
    const parsedPaymentCurrency = String(formData.get("paymentCurrencyCode") ?? "").toUpperCase();
    if (parsedPaymentCurrency === "USD" || parsedPaymentCurrency === "VND") {
      paymentCurrencyCode = parsedPaymentCurrency;
    }
    const parsedPaymentAccountId = String(formData.get("paymentAccountId") ?? "").trim();
    if (parsedPaymentAccountId) {
      paymentAccountId = parsedPaymentAccountId;
    }
    const parsedPaymentCategoryId = String(formData.get("paymentCategoryId") ?? "").trim();
    if (parsedPaymentCategoryId) {
      paymentCategoryId = parsedPaymentCategoryId;
    }
  } else {
    const body = await request.json().catch(() => null);
    const parsedPaymentAmount = Number((body as { paymentAmount?: unknown } | null)?.paymentAmount);
    if (Number.isFinite(parsedPaymentAmount) && parsedPaymentAmount > 0) {
      paymentAmount = parsedPaymentAmount;
    }
    const parsedPaymentCurrency = String((body as { paymentCurrencyCode?: unknown } | null)?.paymentCurrencyCode ?? "").toUpperCase();
    if (parsedPaymentCurrency === "USD" || parsedPaymentCurrency === "VND") {
      paymentCurrencyCode = parsedPaymentCurrency;
    }
    const parsedPaymentAccountId = String((body as { paymentAccountId?: unknown } | null)?.paymentAccountId ?? "").trim();
    if (parsedPaymentAccountId) {
      paymentAccountId = parsedPaymentAccountId;
    }
    const parsedPaymentCategoryId = String((body as { paymentCategoryId?: unknown } | null)?.paymentCategoryId ?? "").trim();
    if (parsedPaymentCategoryId) {
      paymentCategoryId = parsedPaymentCategoryId;
    }
    paymentNote = typeof (body as { paymentNote?: unknown } | null)?.paymentNote === "string"
      ? String((body as { paymentNote?: unknown }).paymentNote)
      : "";
  }

  const purchaseRequest = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!purchaseRequest) {
    return fail("Request không tồn tại", 404);
  }

  let category = null;
  if (purchaseRequest.categoryId) {
    category = await prisma.transactionCategory.findFirst({
      where: {
        id: purchaseRequest.categoryId,
        isActive: true,
      },
    });
  }

  if (!category) {
    category =
      (await prisma.transactionCategory.findFirst({
        where: { code: "ORDER_COST", isActive: true, type: "EXPENSE" },
      })) ??
      (await prisma.transactionCategory.findFirst({
        where: { isActive: true, type: "EXPENSE" },
        orderBy: { createdAt: "asc" },
      }));
  }

  if (!category) {
    return fail("Không tìm thấy danh mục chi phí hợp lệ để thanh toán", 500);
  }

  if (paymentCategoryId) {
    const selectedCategory = await prisma.transactionCategory.findFirst({
      where: {
        id: paymentCategoryId,
        isActive: true,
        type: "EXPENSE",
      },
    });
    if (!selectedCategory) {
      return fail("Danh mục thanh toán không hợp lệ", 400);
    }
    category = selectedCategory;
  }

  if (paymentAccountId) {
    const paymentAccount = await prisma.paymentAccount.findFirst({
      where: {
        id: paymentAccountId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!paymentAccount) {
      return fail("Tài khoản thanh toán không hợp lệ", 400);
    }
  }

  const actualCurrencyCode = paymentCurrencyCode ?? purchaseRequest.currencyCode;
  const fx = actualCurrencyCode === "USD" ? env.defaultUsdToVnd : 1;
  const amountOriginal = paymentAmount ?? Number(purchaseRequest.expectedAmount);
  if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) {
    return fail("Số tiền thực chuyển không hợp lệ", 400);
  }
  const amountVnd = amountOriginal * fx;
  let savedFiles: Array<{ filePath: string; fileName: string; mimeType: string; size: number }> = [];
  try {
    savedFiles = await saveReceiptFiles(receiptFiles);
  } catch (error) {
    const message = mapReceiptStorageError(error);
    if (message) {
      return fail(message, 400);
    }
    throw error;
  }

  let result: {
    transaction: { id: string };
    updatedRequest: typeof purchaseRequest;
  };
  try {
    result = await prisma.$transaction(async (tx: TxClient) => {
      const changed = await tx.purchaseRequest.updateMany({
        where: {
          id,
          status: "APPROVED",
        },
        data: { status: "PAID", categoryId: category.id },
      });
      if (changed.count === 0) {
        throw new Error("REQUEST_NOT_APPROVED_OR_ALREADY_PAID");
      }

      const transaction = await tx.transaction.create({
        data: {
          direction: "OUT",
          teamUsers: { create: { userId: purchaseRequest.requesterId } },
          categoryId: category.id,
          amountOriginal,
          currencyCode: actualCurrencyCode,
          exchangeRateToVnd: fx,
          amountVnd,
          description: [
            `Thanh toán cho yêu cầu mua: ${purchaseRequest.title}`,
            `Số tiền yêu cầu: ${Number(purchaseRequest.expectedAmount).toLocaleString("vi-VN")} ${purchaseRequest.currencyCode}`,
            ...(paymentNote.trim() ? [`Ghi chú người thanh toán: ${paymentNote.trim()}`] : []),
          ].join("\n"),
          notes: paymentNote.trim() ? { paymentTransferNote: paymentNote.trim() } : undefined,
          transactionDate: new Date(),
          paymentMethod: "BANK_TRANSFER",
          paymentAccountId,
          createdBy: auth.user.id,
          approvedBy: auth.user.id,
          purchaseRequestId: purchaseRequest.id,
        },
      });

      if (savedFiles.length > 0) {
        await tx.receiptImage.createMany({
          data: savedFiles.map((file) => ({
            purchaseRequestId: purchaseRequest.id,
            transactionId: transaction.id,
            uploadedBy: auth.user.id,
            filePath: file.filePath,
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size,
          })),
        });
      }

      // Attach any existing request receipts (uploaded earlier in receipt manager)
      // to this transaction so transaction ledger always shows receipt evidence.
      await tx.receiptImage.updateMany({
        where: {
          purchaseRequestId: purchaseRequest.id,
          transactionId: null,
        },
        data: {
          transactionId: transaction.id,
        },
      });

      const updatedRequest = await tx.purchaseRequest.findUnique({ where: { id } });
      if (!updatedRequest) {
        throw new Error("REQUEST_NOT_FOUND_AFTER_UPDATE");
      }

      return { transaction, updatedRequest };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_APPROVED_OR_ALREADY_PAID") {
      return fail("Chỉ thanh toán request đã duyệt và chưa thanh toán", 409);
    }
    throw error;
  }

  await notificationQueue.add("request-paid", {
    requestId: id,
    transactionId: result.transaction.id,
  });

  await writeAuditLog({
    actor: auth.user,
    action: "purchase_request.pay",
    entityType: "purchase_request",
    entityId: id,
    beforeData: purchaseRequest,
    afterData: result.updatedRequest,
  });

  await writeAuditLog({
    actor: auth.user,
    action: "transaction.create",
    entityType: "transaction",
    entityId: result.transaction.id,
    afterData: {
      ...result.transaction,
      receiptCount: savedFiles.length,
    },
  });

  return ok({ ...result, receiptCount: savedFiles.length });
}
