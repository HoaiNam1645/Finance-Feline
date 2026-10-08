import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/app/admin-dashboard";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FelineDashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.roles.includes("ADMIN") && !user.roles.includes("ACCOUNTANT")) {
    redirect("/dashboard");
  }

  return (
    <AdminDashboard
      staffRoleCode="EMPLOYEE"
      categoryRootCode="FELINE"
      excludedCategoryBranchCodes={["Y_KIEN_NGUYEN"]}
      title="Dashboard Feline"
      description="Thống kê giao dịch thuộc cây danh mục Feline, không bao gồm nhánh Dieu Am."
    />
  );
}
