import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  transactionRef: z.string().trim().max(191),
});

// The transaction id is a reference the bank gives back, so it can be filled in
// or corrected at any time without touching amounts or approvals.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("transaction.update");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Transaction ID không hợp lệ", 400);
  }

  const current = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, transactionRef: true },
  });
  if (!current) {
    return fail("Giao dịch không tồn tại", 404);
  }

  const nextRef = parsed.data.transactionRef.trim() || null;
  const row = await prisma.transaction.update({
    where: { id },
    data: { transactionRef: nextRef },
    select: { id: true, transactionRef: true },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "transaction.reference.update",
    entityType: "transaction",
    entityId: id,
    beforeData: { transactionRef: current.transactionRef },
    afterData: { transactionRef: nextRef },
  });

  return ok({ row });
}
