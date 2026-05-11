import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export async function requireApiUser(permission?: string) {
  const user = await getSessionUser();
  if (!user) {
    return { error: "UNAUTHORIZED" as const };
  }

  if (permission && !hasPermission(user.roles, permission)) {
    return { error: "FORBIDDEN" as const };
  }

  return { user };
}
