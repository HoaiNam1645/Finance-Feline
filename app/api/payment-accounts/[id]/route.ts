import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  accountName: z.string().min(2).optional(),
  bankName: z.string().min(2).optional(),
  accountNumber: z.string().min(3).optional(),
  ownerName: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
});

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("user.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }
  if (
    typeof parsed.data.accountName === "undefined" &&
    typeof parsed.data.bankName === "undefined" &&
    typeof parsed.data.accountNumber === "undefined" &&
    typeof parsed.data.ownerName === "undefined" &&
    typeof parsed.data.isActive === "undefined"
  ) {
    return fail("Không có dữ liệu cập nhật", 400);
  }

  const { id } = await params;
  const before = await prisma.paymentAccount.findUnique({ where: { id } });
  if (!before) {
    return fail("Tài khoản thanh toán không tồn tại", 404);
  }

  const accountName =
    typeof parsed.data.accountName === "string" ? normalizeText(parsed.data.accountName) : before.accountName;
  const bankName = typeof parsed.data.bankName === "string" ? normalizeText(parsed.data.bankName) : before.bankName;
  const accountNumber =
    typeof parsed.data.accountNumber === "string" ? normalizeText(parsed.data.accountNumber) : before.accountNumber;
  const ownerName = typeof parsed.data.ownerName === "string" ? normalizeText(parsed.data.ownerName) : before.ownerName;

  if (accountName.length < 2 || bankName.length < 2 || accountNumber.length < 3 || ownerName.length < 2) {
    return fail("Thông tin tài khoản thanh toán không hợp lệ", 400);
  }

  const duplicated = await prisma.paymentAccount.findFirst({
    where: {
      id: { not: id },
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

  const row = await prisma.paymentAccount.update({
    where: { id },
    data: {
      accountName,
      bankName,
      accountNumber,
      ownerName,
      isActive: typeof parsed.data.isActive === "boolean" ? parsed.data.isActive : before.isActive,
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "payment_account.update",
    entityType: "payment_account",
    entityId: row.id,
    beforeData: before,
    afterData: row,
  });

  return ok({ row });
}
