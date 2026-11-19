import { requireApiUser } from "@/lib/api-auth";
import { getUsdWalletsByRole } from "@/lib/accountant-wallet";
import { forbidden, ok, unauthorized } from "@/lib/http";

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  if (!auth.user.roles.includes("ADMIN") && !auth.user.roles.includes("ACCOUNTANT")) {
    return forbidden();
  }

  return ok({ rows: await getUsdWalletsByRole("ACCOUNTANT") });
}
