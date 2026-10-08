import { redirect } from "next/navigation";
import { AccountWalletsManager } from "@/components/app/account-wallets-manager";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountWalletsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const allowed =
    user.roles.includes("ADMIN") || user.roles.includes("ACCOUNTANT") || user.roles.includes("ACCOUNT");
  if (!allowed) {
    redirect("/purchase-requests");
  }

  return <AccountWalletsManager />;
}
