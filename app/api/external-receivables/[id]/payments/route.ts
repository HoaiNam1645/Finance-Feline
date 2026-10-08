import { z } from "zod";
import { env } from "@/lib/env";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";

const createSchema = z.object({
  amountOriginal: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
  paymentDate: z.string().datetime().optional(),
  paymentAccountId: z.string().trim().min(1),
  note: z.string().trim().max(1000).optional(),
});

function parseNumberInput(value: FormDataEntryValue | null) {
  const numberValue = Number(String(value ?? ""));
  return Number.isFinite(numberValue) ? numberValue : NaN;
}

function parseOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function toVnd(amount: number, currencyCode: "VND" | "USD") {
  return currencyCode === "USD" ? amount * env.defaultUsdToVnd : amount;
}

function exchangeRate(currencyCode: "VND" | "USD") {
  return currencyCode === "USD" ? env.defaultUsdToVnd : 1;
}

async function recalculateStatus(receivableId: string) {
  const row = await prisma.externalReceivable.findUnique({
    where: { id: receivableId },
    include: { payments: { select: { amountVnd: true } } },
  });
  if (!row || row.status === "CANCELLED") return row?.status ?? null;

  const paidAmountVnd = row.payments.reduce((sum, payment) => sum + Number(payment.amountVnd), 0);
  const totalVnd = Number(row.amountVnd);
  const nextStatus = paidAmountVnd >= totalVnd - 0.5 ? "PAID" : paidAmountVnd > 0 ? "PARTIAL" : "OPEN";
  await prisma.externalReceivable.update({
    where: { id: receivableId },
    data: { status: nextStatus },
  });
  return nextStatus;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return fail("Payload phải là form-data", 400);
  }

  const formData = await request.formData();
  const parsed = createSchema.safeParse({
    amountOriginal: parseNumberInput(formData.get("amountOriginal")),
    currencyCode: String(formData.get("currencyCode") ?? ""),
    paymentDate: parseOptionalText(formData.get("paymentDate")),
    paymentAccountId: formData.get("paymentAccountId"),
    note: parseOptionalText(formData.get("note")),
  });
  if (!parsed.success) {
    return fail("Thông tin thu tiền không hợp lệ", 400);
  }

  const receivable = await prisma.externalReceivable.findUnique({
    where: { id },
    include: { payments: { select: { amountVnd: true } } },
  });
  if (!receivable) {
    return fail("Không tìm thấy công nợ", 404);
  }
  if (receivable.status === "CANCELLED") {
    return fail("Không thể thu tiền cho công nợ đã hủy", 400);
  }
  if (receivable.status === "PAID") {
    return fail("Công nợ này đã thu đủ", 400);
  }

  const paymentAccount = await prisma.paymentAccount.findFirst({
    where: { id: parsed.data.paymentAccountId, isActive: true },
    select: { id: true },
  });
  if (!paymentAccount) {
    return fail("Tài khoản nhận tiền không hợp lệ", 400);
  }

  const paidAmountVnd = receivable.payments.reduce((sum, payment) => sum + Number(payment.amountVnd), 0);
  const paymentAmountVnd = toVnd(parsed.data.amountOriginal, parsed.data.currencyCode);
  const remainingAmountVnd = Number(receivable.amountVnd) - paidAmountVnd;
  if (paymentAmountVnd > remainingAmountVnd + 0.5) {
    return fail("Số tiền thu vượt quá công nợ còn lại", 400);
  }

  const paymentDate = parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : new Date();
  if (Number.isNaN(paymentDate.getTime())) {
    return fail("Ngày thu tiền không hợp lệ", 400);
  }

  const receiptFile = formData.get("receiptFile");
  let savedReceipt: { filePath: string; fileName: string; mimeType: string; size: number } | null = null;
  if (receiptFile instanceof File && receiptFile.size > 0) {
    try {
      const savedFiles = await saveReceiptFiles([receiptFile]);
      savedReceipt = savedFiles[0] ?? null;
    } catch (error) {
      const message = mapReceiptStorageError(error);
      if (message) return fail(message, 400);
      throw error;
    }
  }

  const row = await prisma.externalReceivablePayment.create({
    data: {
      receivableId: receivable.id,
      amountOriginal: parsed.data.amountOriginal,
      currencyCode: parsed.data.currencyCode,
      exchangeRateToVnd: exchangeRate(parsed.data.currencyCode),
      amountVnd: paymentAmountVnd,
      paymentDate,
      paymentAccountId: paymentAccount.id,
      note: parsed.data.note ?? null,
      receiptImagePath: savedReceipt?.filePath ?? null,
      receiptImageName: savedReceipt?.fileName ?? null,
      receiptImageMimeType: savedReceipt?.mimeType ?? null,
      receiptImageSize: savedReceipt?.size ?? null,
      createdBy: auth.user.id,
    },
  });
  const nextStatus = await recalculateStatus(receivable.id);

  await writeAuditLog({
    actor: auth.user,
    action: "external_receivable_payment.create",
    entityType: "ExternalReceivablePayment",
    entityId: row.id,
    afterData: { ...row, receivableStatus: nextStatus },
  });

  return ok({ row, receivableStatus: nextStatus }, 201);
}
