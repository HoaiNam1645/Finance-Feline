import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const SPECIAL_DELETE_EMAIL = "ngobao@bugmedia.vn";

const updateSchema = z.object({
  teamUserId: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).optional()),
  categoryId: z.string().min(1),
  amountOriginal: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
  description: z.string().min(3),
  transactionDate: z.string().datetime(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("transaction.update");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const current = await prisma.transaction.findUnique({ where: { id } });
  if (!current) {
    return fail("Giao dịch không tồn tại", 404);
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const category = await prisma.transactionCategory.findFirst({
    where: {
      id: parsed.data.categoryId,
      isActive: true,
    },
    select: { id: true, type: true },
  });
  if (!category) {
    return fail("Danh mục không hợp lệ", 400);
  }

  if (typeof parsed.data.teamUserId !== "undefined") {
    const teamUser = await prisma.user.findFirst({
      where: {
        id: parsed.data.teamUserId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!teamUser) {
      return fail("User team không hợp lệ", 400);
    }
  }

  const direction = category.type === "INCOME" ? "IN" : "OUT";

  const fx = parsed.data.currencyCode === "USD" ? env.defaultUsdToVnd : 1;
  const amountVnd = parsed.data.amountOriginal * fx;

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      direction,
      ...(typeof parsed.data.teamUserId !== "undefined" ? { teamUserId: parsed.data.teamUserId ?? null } : {}),
      categoryId: parsed.data.categoryId,
      amountOriginal: parsed.data.amountOriginal,
      currencyCode: parsed.data.currencyCode,
      exchangeRateToVnd: fx,
      amountVnd,
      description: parsed.data.description,
      transactionDate: new Date(parsed.data.transactionDate),
      paymentMethod: current.paymentMethod,
      approvedBy: auth.user.id,
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "transaction.update",
    entityType: "transaction",
    entityId: id,
    beforeData: current,
    afterData: updated,
  });

  return ok({ row: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  if (auth.user.email.toLowerCase() !== SPECIAL_DELETE_EMAIL) {
    return forbidden();
  }

  const { id } = await params;
  const current = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      purchaseRequestId: true,
      amountOriginal: true,
      currencyCode: true,
      amountVnd: true,
      direction: true,
      description: true,
      transactionDate: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!current) {
    return fail("Giao dịch không tồn tại", 404);
  }

  await prisma.$transaction(async (tx: TxClient) => {
    await tx.transaction.delete({ where: { id } });

    if (current.purchaseRequestId) {
      await tx.purchaseRequest.updateMany({
        where: {
          id: current.purchaseRequestId,
          status: "PAID",
        },
        data: {
          status: "APPROVED",
        },
      });
    }
  });

  await writeAuditLog({
    actor: auth.user,
    action: "transaction.delete",
    entityType: "transaction",
    entityId: id,
    beforeData: current,
  });

  return ok({ id });
}
