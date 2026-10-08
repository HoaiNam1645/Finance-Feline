import { redirect } from "next/navigation";
import { OperatingRulesContent } from "@/components/app/operating-rules-content";
import { getSessionUser } from "@/lib/auth";

export default async function OperatingRulesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <OperatingRulesContent />;
}
