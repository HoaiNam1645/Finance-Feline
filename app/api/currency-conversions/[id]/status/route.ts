import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { CurrencyConversionActionError, updateCurrencyConversionStatus } from "@/lib/currency-conversion-actions";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { notifyCurrencyConversionStatusChanged } from "@/lib/telegram";

const schema = z.object({
  status: z.enum(["FAILED", "SUCCEEDED"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Trạng thái quy đổi không hợp lệ", 400);
  }

  const { id } = await params;
  try {
    const row = await updateCurrencyConversionStatus({
      id,
      actor: auth.user,
      status: parsed.data.status,
    });
    await notifyCurrencyConversionStatusChanged(row.id).catch((error) => {
      console.error("[telegram] currency conversion status notification failed", error);
    });
    return ok({ row });
  } catch (error) {
    if (error instanceof CurrencyConversionActionError) {
      return fail(error.message, error.status);
    }
    throw error;
  }
}
