import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/app/admin-dashboard";
import { EmployeeDashboardOverview } from "@/components/app/employee-dashboard-overview";
import { getSessionUser } from "@/lib/auth";
import { DIEU_AM_CATEGORY_BRANCH_CODE, DIEU_AM_ROLE_CODE } from "@/lib/dieu-am-scope";
import { isStaffOnly } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const isAdminOrAccountant = user.roles.includes("ADMIN") || user.roles.includes("ACCOUNTANT");
  if (!isAdminOrAccountant && user.roles.includes(DIEU_AM_ROLE_CODE)) {
    return (
      <AdminDashboard
        staffRoleCode={DIEU_AM_ROLE_CODE}
        categoryRootCode={DIEU_AM_CATEGORY_BRANCH_CODE}
        excludedCategoryBranchCodes={[]}
        title="Dashboard Dieu Am"
        description="Thống kê các giao dịch thuộc nhánh Dieu Am."
        variant="category-only"
      />
    );
  }

  const isEmployeeOnly = isStaffOnly(user.roles);
  if (isEmployeeOnly) {
    const startOfMonth = new Date();
    startOfMonth.setHours(0, 0, 0, 0);
    startOfMonth.setDate(1);
    const [requestStatusRows, recentRequests, monthlyTransactionRows, recentTransactions, pendingAdjustmentCount] =
      await Promise.all([
        prisma.purchaseRequest.groupBy({
          by: ["status"],
          where: { requesterId: user.id },
          _count: { _all: true },
        }),
        prisma.purchaseRequest.findMany({
          where: { requesterId: user.id },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            title: true,
            status: true,
            expectedAmount: true,
            currencyCode: true,
            createdAt: true,
          },
        }),
        prisma.transaction.groupBy({
          by: ["direction"],
          where: {
            teamUsers: { some: { userId: user.id } },
            transactionDate: { gte: startOfMonth },
          },
          _count: { _all: true },
          _sum: { amountVnd: true },
        }),
        prisma.transaction.findMany({
          where: { teamUsers: { some: { userId: user.id } } },
          orderBy: { transactionDate: "desc" },
          take: 8,
          select: {
            id: true,
            description: true,
            direction: true,
            amountOriginal: true,
            currencyCode: true,
            amountVnd: true,
            transactionDate: true,
            adjustments: {
              orderBy: { requestedAt: "desc" },
              take: 1,
              select: { status: true },
            },
          },
        }),
        prisma.transactionAdjustment.count({
          where: {
            requestedBy: user.id,
            status: "PENDING",
          },
        }),
      ]);
    const requestCountByStatus = new Map<string, number>();
    for (const row of requestStatusRows) {
      requestCountByStatus.set(row.status, row._count._all);
    }
    let monthlyIncomeVnd = 0;
    let monthlyExpenseVnd = 0;
    let monthlyTransactionCount = 0;
    for (const row of monthlyTransactionRows) {
      monthlyTransactionCount += row._count._all;
      if (row.direction === "IN") {
        monthlyIncomeVnd += Number(row._sum.amountVnd ?? 0);
      } else if (row.direction === "OUT") {
        monthlyExpenseVnd += Number(row._sum.amountVnd ?? 0);
      }
    }

    return (
      <EmployeeDashboardOverview
        userName={user.fullName}
        summary={{
          totalRequests: requestStatusRows.reduce(
            (sum: number, row: { _count: { _all: number } }) => sum + row._count._all,
            0
          ),
          pendingRequests: requestCountByStatus.get("PENDING_APPROVAL") ?? 0,
          paidRequests: requestCountByStatus.get("PAID") ?? 0,
          monthlyIncomeVnd: Math.round(monthlyIncomeVnd),
          monthlyExpenseVnd: Math.round(monthlyExpenseVnd),
          monthlyTransactionCount,
          pendingAdjustmentCount,
        }}
        recentRequests={recentRequests.map((row: (typeof recentRequests)[number]) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          expectedAmount: Number(row.expectedAmount),
          currencyCode: row.currencyCode,
          createdAt: row.createdAt.toISOString(),
        }))}
        recentTransactions={recentTransactions.map((row: (typeof recentTransactions)[number]) => ({
          id: row.id,
          description: row.description,
          direction: row.direction,
          amountOriginal: Number(row.amountOriginal),
          currencyCode: row.currencyCode,
          amountVnd: Number(row.amountVnd),
          transactionDate: row.transactionDate.toISOString(),
          latestAdjustmentStatus: row.adjustments[0]?.status ?? null,
        }))}
      />
    );
  }

  if (!isAdminOrAccountant) {
    redirect("/purchase-requests");
  }

  return <AdminDashboard variant="compact" />;
}
