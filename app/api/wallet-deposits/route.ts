import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const depositSchema = z.object({
  conversionId: z.string().min(1),
  amountUsd: z.number().positive(),
});

function canManageWallets(roles: string[]) {
  return roles.includes("ADMIN") || roles.includes("ACCOUNTANT");
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  if (!canManageWallets(auth.user.roles)) return forbidden();

  const ownerId = new URL(request.url).searchParams.get("ownerId")?.trim();
  if (!ownerId) return fail("Thiếu chủ ví", 400);

  const rows = await prisma.currencyConversion.findMany({
    where: { createdBy: ownerId, status: "SUCCEEDED" },
    orderBy: { decidedAt: "desc" },
    select: {
      id: true,
      amountUsd: true,
      actualReceivedUsd: true,
      amountVnd: true,
      createdAt: true,
      decidedAt: true,
      walletName: true,
    },
  });

  return ok({
    rows: rows
      .map((row) => ({
        ...row,
        remainingUsd: Math.max(0, Number(row.amountUsd) - Number(row.actualReceivedUsd ?? 0)),
      }))
      .filter((row) => row.remainingUsd > 0),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  if (!canManageWallets(auth.user.roles)) return forbidden();

  const parsed = depositSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Thông tin nạp tiền không hợp lệ", 400);

  const before = await prisma.currencyConversion.findUnique({ where: { id: parsed.data.conversionId } });
  if (!before) return fail("Lệnh quy đổi không tồn tại", 404);
  if (before.status !== "SUCCEEDED") return fail("Chỉ được nạp tiền từ lệnh quy đổi thành công", 400);

  const currentReceived = Number(before.actualReceivedUsd ?? 0);
  const requested = Number(before.amountUsd);
  if (currentReceived + parsed.data.amountUsd > requested) {
    return fail(`Chỉ còn có thể nạp tối đa ${(requested - currentReceived).toLocaleString("vi-VN")} USD`, 400);
  }

  const row = await prisma.currencyConversion.update({
    where: { id: before.id },
    data: { actualReceivedUsd: currentReceived + parsed.data.amountUsd },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "account_wallet.deposit",
    entityType: "currency_conversion",
    entityId: row.id,
    beforeData: before,
    afterData: row,
  });

  return ok({ row });
}
