import type { CurrencyConversion, CurrencyConversionStatus } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export class CurrencyConversionActionError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

function canUpdateConversionStatus(actor: SessionUser) {
  return actor.roles.includes("ADMIN") || actor.roles.includes("ACCOUNTANT");
}

export async function updateCurrencyConversionStatus(input: {
  id: string;
  actor: SessionUser;
  status: Extract<CurrencyConversionStatus, "FAILED" | "SUCCEEDED">;
  auditAction?: string;
}) {
  const { id, actor, status } = input;
  if (!canUpdateConversionStatus(actor)) {
    throw new CurrencyConversionActionError("Bạn không có quyền cập nhật trạng thái quy đổi", 403);
  }

  const before = await prisma.currencyConversion.findUnique({ where: { id } });
  if (!before) {
    throw new CurrencyConversionActionError("Phiếu quy đổi không tồn tại", 404);
  }
  if (before.status !== "PENDING") {
    throw new CurrencyConversionActionError("Chỉ được cập nhật phiếu quy đổi đang chờ", 400);
  }

  let updated: CurrencyConversion | null = null;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.currencyConversion.updateMany({
        where: {
          id,
          status: "PENDING",
        },
        data: {
          status,
          decidedBy: actor.id,
          decidedAt: new Date(),
        },
      });
      if (changed.count === 0) {
        throw new Error("CONVERSION_STATUS_CHANGED");
      }
      return tx.currencyConversion.findUnique({ where: { id } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONVERSION_STATUS_CHANGED") {
      throw new CurrencyConversionActionError("Phiếu quy đổi đã đổi trạng thái, vui lòng tải lại", 409);
    }
    throw error;
  }

  if (!updated) {
    throw new CurrencyConversionActionError("Không thể cập nhật phiếu quy đổi", 500);
  }

  await writeAuditLog({
    actor,
    action: input.auditAction ?? `currency_conversion.${status === "SUCCEEDED" ? "succeed" : "fail"}`,
    entityType: "currency_conversion",
    entityId: id,
    beforeData: before,
    afterData: updated,
  });

  return updated;
}
