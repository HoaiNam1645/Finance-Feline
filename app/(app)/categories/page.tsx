import { redirect } from "next/navigation";
import { CategoriesManager } from "@/components/app/categories-manager";
import { getSessionUser } from "@/lib/auth";

export default async function CategoriesPage() {
  const user = await getSessionUser();
  const allowed = user?.roles.includes("ADMIN") || user?.roles.includes("ACCOUNTANT");

  if (!allowed) {
    redirect("/dashboard");
  }

  return <CategoriesManager />;
}
