import { requireApiUser } from "@/lib/api-auth";
import { forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLE_CODES } from "@/lib/roles";

export async function GET() {
  const auth = await requireApiUser("transaction.read");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }
  const canReadAllTransactions = auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");

  const rows = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: {
        some: {
          role: { code: { in: [...STAFF_ROLE_CODES] } },
        },
      },
      AND: [
        {
          roles: {
            none: {
              role: { code: "ADMIN" },
            },
          },
        },
        {
          roles: {
            none: {
              role: { code: "ACCOUNTANT" },
            },
          },
        },
      ],
      ...(canReadAllTransactions ? {} : { id: auth.user.id }),
    },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  });

  return ok({ rows });
}
