import { redirect } from "next/navigation";
import { CurrencyConversionsManager } from "@/components/app/currency-conversions-manager";
import { getSessionUser } from "@/lib/auth";

export default async function CurrencyConversionsPage() {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes("ADMIN") && !user.roles.includes("ACCOUNTANT"))) {
    redirect("/purchase-requests");
  }

  return <CurrencyConversionsManager />;
}
