import { requireApiUser } from "@/lib/api-auth";
import { forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/** Active Account members, used to pick whose wallet a buy-back credits. */
export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const rows = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { some: { role: { code: "ACCOUNT" } } },
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, email: true },
  });

  return ok({ rows });
}
