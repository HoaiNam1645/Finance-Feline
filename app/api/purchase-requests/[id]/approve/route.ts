import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { approvePurchaseRequest, PurchaseRequestActionError } from "@/lib/purchase-request-actions";

const schema = z.object({ note: z.string().min(2).max(500).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.approve");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const { id } = await params;
  try {
    const updated = await approvePurchaseRequest({
      id,
      actor: auth.user,
      note: parsed.data.note,
    });

    return ok({ row: updated });
  } catch (error) {
    if (error instanceof PurchaseRequestActionError) {
      return fail(error.message, error.status);
    }
    throw error;
  }
}
