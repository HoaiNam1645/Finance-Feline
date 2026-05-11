import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PurchaseRequestStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";
type AdjustmentStatus = "PENDING" | "APPROVED" | "REJECTED";

type EmployeeDashboardSummary = {
  totalRequests: number;
  pendingRequests: number;
  paidRequests: number;
  monthlyIncomeVnd: number;
  monthlyExpenseVnd: number;
  monthlyTransactionCount: number;
  pendingAdjustmentCount: number;
};

type EmployeeRequestRow = {
  id: string;
  title: string;
  status: PurchaseRequestStatus;
  expectedAmount: number;
  currencyCode: string;
  createdAt: string;
};

type EmployeeTransactionRow = {
  id: string;
  description: string;
  direction: "IN" | "OUT";
  amountOriginal: number;
  currencyCode: string;
  amountVnd: number;
  transactionDate: string;
  latestAdjustmentStatus: AdjustmentStatus | null;
};

type EmployeeDashboardOverviewProps = {
  userName: string;
  summary: EmployeeDashboardSummary;
  recentRequests: EmployeeRequestRow[];
  recentTransactions: EmployeeTransactionRow[];
};

const numberFormatter = new Intl.NumberFormat("vi-VN");

function formatMoney(value: number, currencyCode: string) {
  return `${numberFormatter.format(Math.round(value))} ${currencyCode}`;
}

function requestStatusMeta(status: PurchaseRequestStatus) {
  if (status === "PENDING_APPROVAL") {
    return { label: "Chờ duyệt", className: "border-amber-200 bg-amber-100 text-amber-700" };
  }
  if (status === "APPROVED") {
    return { label: "Đã duyệt", className: "border-sky-200 bg-sky-100 text-sky-700" };
  }
  if (status === "REJECTED") {
    return { label: "Từ chối", className: "border-rose-200 bg-rose-100 text-rose-700" };
  }
  if (status === "PAID") {
    return { label: "Đã thanh toán", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (status === "CANCELLED") {
    return { label: "Đã hủy", className: "border-slate-200 bg-slate-100 text-slate-700" };
  }
  return { label: "Nháp", className: "border-slate-200 bg-slate-100 text-slate-700" };
}

function adjustmentStatusMeta(status: AdjustmentStatus | null) {
  if (status === "PENDING") {
    return { label: "Điều chỉnh chờ duyệt", className: "border-amber-200 bg-amber-100 text-amber-700" };
  }
  if (status === "APPROVED") {
    return { label: "Điều chỉnh đã duyệt", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (status === "REJECTED") {
    return { label: "Điều chỉnh bị từ chối", className: "border-rose-200 bg-rose-100 text-rose-700" };
  }
  return null;
}

export function EmployeeDashboardOverview({
  userName,
  summary,
  recentRequests,
  recentTransactions,
}: EmployeeDashboardOverviewProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Dashboard cá nhân</CardTitle>
          <CardDescription>Xin chào {userName}. Dữ liệu trên trang này chỉ hiển thị thông tin của bạn.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/purchase-requests">Tạo yêu cầu mua</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/transactions">Xem sổ giao dịch của tôi</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Tổng yêu cầu mua</CardDescription>
            <CardTitle>{numberFormatter.format(summary.totalRequests)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Đã thanh toán: {numberFormatter.format(summary.paidRequests)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Yêu cầu đang chờ duyệt</CardDescription>
            <CardTitle>{numberFormatter.format(summary.pendingRequests)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Điều chỉnh đang chờ duyệt: {numberFormatter.format(summary.pendingAdjustmentCount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Thu tháng này (VND)</CardDescription>
            <CardTitle className="text-emerald-700">{formatMoney(summary.monthlyIncomeVnd, "VND")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {numberFormatter.format(summary.monthlyTransactionCount)} giao dịch trong tháng
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Chi tháng này (VND)</CardDescription>
            <CardTitle className="text-rose-700">{formatMoney(summary.monthlyExpenseVnd, "VND")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Chênh lệch: {formatMoney(summary.monthlyIncomeVnd - summary.monthlyExpenseVnd, "VND")}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yêu cầu mua gần đây</CardTitle>
            <CardDescription>8 yêu cầu mới nhất của bạn</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bạn chưa có yêu cầu mua nào.</p>
            ) : (
              recentRequests.map((row) => {
                const status = requestStatusMeta(row.status);
                return (
                  <div key={row.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium">{row.title}</p>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(row.createdAt).toLocaleString("vi-VN")}</span>
                      <span className="font-medium text-foreground">
                        {formatMoney(row.expectedAmount, row.currencyCode)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Giao dịch gần đây</CardTitle>
            <CardDescription>8 giao dịch gần nhất của bạn</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bạn chưa có giao dịch nào được gắn theo team.</p>
            ) : (
              recentTransactions.map((row) => {
                const adjustmentMeta = adjustmentStatusMeta(row.latestAdjustmentStatus);
                return (
                  <div key={row.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium">{row.description}</p>
                      <span className={row.direction === "IN" ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-rose-700"}>
                        {row.direction === "IN" ? "Thu" : "Chi"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(row.transactionDate).toLocaleString("vi-VN")}</span>
                      <span className="font-medium text-foreground">{formatMoney(row.amountOriginal, row.currencyCode)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Quy đổi: {formatMoney(row.amountVnd, "VND")}
                    </div>
                    {adjustmentMeta ? (
                      <Badge variant="outline" className={`mt-2 ${adjustmentMeta.className}`}>
                        {adjustmentMeta.label}
                      </Badge>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
