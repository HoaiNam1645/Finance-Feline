import { requireApiUser } from "@/lib/api-auth";
import { getAccountWallets } from "@/lib/account-wallet";
import { forbidden, ok, unauthorized } from "@/lib/http";

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const canReadAll = auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");
  if (!canReadAll && !auth.user.roles.includes("ACCOUNT")) {
    return forbidden();
  }

  // An Account member only ever sees their own wallet.
  const rows = await getAccountWallets(canReadAll ? undefined : [auth.user.id]);
  return ok({ rows });
}
