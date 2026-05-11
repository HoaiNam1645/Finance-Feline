import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  accountName: z.string().min(2),
  bankName: z.string().min(2),
  accountNumber: z.string().min(3),
  ownerName: z.string().min(2),
  isActive: z.boolean().optional(),
});

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function GET(request: Request) {
  const auth = await requireApiUser("transaction.create");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const rows = await prisma.paymentAccount.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ isActive: "desc" }, { accountName: "asc" }],
  });

  return ok({ rows });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("user.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const accountName = normalizeText(parsed.data.accountName);
  const bankName = normalizeText(parsed.data.bankName);
  const accountNumber = normalizeText(parsed.data.accountNumber);
  const ownerName = normalizeText(parsed.data.ownerName);
  if (accountName.length < 2 || bankName.length < 2 || accountNumber.length < 3 || ownerName.length < 2) {
    return fail("Thông tin tài khoản thanh toán không hợp lệ", 400);
  }

  const duplicated = await prisma.paymentAccount.findFirst({
    where: {
      accountNumber: {
        equals: accountNumber,
      },
      bankName: {
        equals: bankName,
      },
    },
    select: { id: true },
  });
  if (duplicated) {
    return fail("Tài khoản thanh toán đã tồn tại", 409);
  }

  const row = await prisma.paymentAccount.create({
    data: {
      accountName,
      bankName,
      accountNumber,
      ownerName,
      isActive: parsed.data.isActive ?? true,
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "payment_account.create",
    entityType: "payment_account",
    entityId: row.id,
    afterData: row,
  });

  return ok({ row }, 201);
}
