import { getSessionUser } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return unauthorized();
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!currentUser) {
    return unauthorized();
  }

  return ok({
    user: {
      id: currentUser.id,
      email: currentUser.email,
      fullName: currentUser.fullName,
      roles: currentUser.roles.map((entry: (typeof currentUser.roles)[number]) => entry.role.code),
    },
  });
}
