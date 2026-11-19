import { redirect } from "next/navigation";
import { AccountantWalletsManager } from "@/components/app/accountant-wallets-manager";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PublicFundWalletsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.roles.includes("ADMIN") && !user.roles.includes("ACCOUNTANT")) {
    redirect("/purchase-requests");
  }

  return (
    <AccountantWalletsManager
      endpoint="/api/public-fund-wallets"
      title="Ví công quỹ"
      description="Theo dõi số dư và lịch sử thu chi USD của từng tài khoản quản trị."
    />
  );
}
