import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const statusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export async function GET(request: Request) {
  const auth = await requireApiUser("transaction.adjust.approve");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const parsedStatus = statusSchema.safeParse(rawStatus ?? "PENDING");
  const status = parsedStatus.success ? parsedStatus.data : "PENDING";

  const rows = await prisma.transactionAdjustment.findMany({
    where: { status },
    orderBy: { requestedAt: "desc" },
    include: {
      requester: { select: { id: true, fullName: true, email: true } },
      approver: { select: { id: true, fullName: true, email: true } },
      transaction: {
        select: {
          id: true,
          description: true,
          amountOriginal: true,
          currencyCode: true,
          transactionDate: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  return ok({ rows });
}
