import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  partyId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(191),
  description: z.string().trim().max(2000).optional(),
  amountOriginal: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
  occurredAt: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});

function toVnd(amount: number, currencyCode: "VND" | "USD") {
  return currencyCode === "USD" ? amount * env.defaultUsdToVnd : amount;
}

function exchangeRate(currencyCode: "VND" | "USD") {
  return currencyCode === "USD" ? env.defaultUsdToVnd : 1;
}

function normalizeReceiptPath(filePath: string | null) {
  if (!filePath) return filePath;
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) return filePath;
  if (filePath.startsWith("/")) return filePath;
  if (filePath.startsWith("public/")) return `/${filePath.replace(/^public\/+/, "")}`;
  return `/${filePath}`;
}

type ExternalReceivableWithPayments = Prisma.ExternalReceivableGetPayload<{
  include: {
    party: true;
    creator: { select: { id: true; fullName: true; email: true } };
    payments: {
      include: {
        paymentAccount: {
          select: { id: true; accountName: true; bankName: true; accountNumber: true; ownerName: true };
        };
        creator: { select: { id: true; fullName: true; email: true } };
      };
    };
  };
}>;

function normalizeRow(row: ExternalReceivableWithPayments) {
  const paidAmountVnd = row.payments.reduce((sum, payment) => sum + Number(payment.amountVnd), 0);
  const amountVnd = Number(row.amountVnd);
  return {
    ...row,
    paidAmountVnd,
    remainingAmountVnd: Math.max(0, amountVnd - paidAmountVnd),
    payments: row.payments.map((payment) => ({
      ...payment,
      receiptImagePath: normalizeReceiptPath(payment.receiptImagePath),
    })),
  };
}

export async function GET(request: Request) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const partyId = searchParams.get("partyId");

  const rows = await prisma.externalReceivable.findMany({
    where: {
      ...(status && status !== "__ALL__" ? { status: status as never } : {}),
      ...(partyId && partyId !== "__ALL__" ? { partyId } : {}),
    },
    include: {
      party: true,
      creator: { select: { id: true, fullName: true, email: true } },
      payments: {
        include: {
          paymentAccount: {
            select: { id: true, accountName: true, bankName: true, accountNumber: true, ownerName: true },
          },
          creator: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { paymentDate: "desc" },
      },
    },
    orderBy: { occurredAt: "desc" },
  });

  return ok({ rows: rows.map(normalizeRow) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Thông tin công nợ không hợp lệ", 400);
  }

  const party = await prisma.externalParty.findFirst({
    where: { id: parsed.data.partyId, isActive: true },
    select: { id: true },
  });
  if (!party) {
    return fail("Bên nợ không hợp lệ", 400);
  }

  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (Number.isNaN(occurredAt.getTime()) || (dueDate && Number.isNaN(dueDate.getTime()))) {
    return fail("Ngày công nợ không hợp lệ", 400);
  }

  const row = await prisma.externalReceivable.create({
    data: {
      partyId: party.id,
      title: parsed.data.title,
      description: parsed.data.description?.trim() || null,
      amountOriginal: parsed.data.amountOriginal,
      currencyCode: parsed.data.currencyCode,
      exchangeRateToVnd: exchangeRate(parsed.data.currencyCode),
      amountVnd: toVnd(parsed.data.amountOriginal, parsed.data.currencyCode),
      occurredAt,
      dueDate,
      createdBy: auth.user.id,
    },
    include: {
      party: true,
      creator: { select: { id: true, fullName: true, email: true } },
      payments: {
        include: {
          paymentAccount: {
            select: { id: true, accountName: true, bankName: true, accountNumber: true, ownerName: true },
          },
          creator: { select: { id: true, fullName: true, email: true } },
        },
      },
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "external_receivable.create",
    entityType: "ExternalReceivable",
    entityId: row.id,
    afterData: row,
  });

  return ok({ row: normalizeRow(row) }, 201);
}
