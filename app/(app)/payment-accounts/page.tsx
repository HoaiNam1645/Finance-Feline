import { redirect } from "next/navigation";
import { PaymentAccountsManager } from "@/components/app/payment-accounts-manager";
import { getSessionUser } from "@/lib/auth";

export default async function PaymentAccountsPage() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("ADMIN")) {
    redirect("/purchase-requests");
  }

  return <PaymentAccountsManager />;
}
