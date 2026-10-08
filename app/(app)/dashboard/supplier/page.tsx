import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/app/admin-dashboard";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SupplierDashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.roles.includes("ADMIN") && !user.roles.includes("ACCOUNTANT")) {
    redirect("/dashboard");
  }

  return (
    <AdminDashboard
      staffRoleCode="WORKSHOP"
      categoryRootCode="SUPPLIER"
      title="Dashboard Supplier Theuni US"
      description="Thống kê toàn bộ giao dịch thuộc cây danh mục Supplier Theuni US."
    />
  );
}
