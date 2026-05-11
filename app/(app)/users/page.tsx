import { redirect } from "next/navigation";
import { UsersManager } from "@/components/app/users-manager";
import { getSessionUser } from "@/lib/auth";

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("ADMIN")) {
    redirect("/purchase-requests");
  }

  return <UsersManager />;
}

