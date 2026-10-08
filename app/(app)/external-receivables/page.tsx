import { redirect } from "next/navigation";
import { ExternalReceivablesManager } from "@/components/app/external-receivables-manager";
import { getSessionUser } from "@/lib/auth";

export default async function ExternalReceivablesPage() {
  const user = await getSessionUser();
  if (!user || (!user.roles.includes("ADMIN") && !user.roles.includes("ACCOUNTANT"))) {
    redirect("/purchase-requests");
  }

  return <ExternalReceivablesManager />;
}
