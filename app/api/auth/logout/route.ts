import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { ok } from "@/lib/http";

export async function POST() {
  const user = await getSessionUser();
  await clearSessionCookie();

  await writeAuditLog({
    actor: user,
    action: "auth.logout",
    entityType: "auth_session",
    entityId: user?.id ?? "anonymous",
    afterData: {
      userId: user?.id ?? null,
      fullName: user?.fullName ?? null,
      email: user?.email ?? null,
    },
  });

  return ok({ success: true });
}
