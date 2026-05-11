import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function mapActionLabel(action: string) {
  const labels: Record<string, string> = {
    "auth.login.success": "Đăng nhập thành công",
    "auth.login.failed": "Đăng nhập thất bại",
    "auth.login.invalid_payload": "Đăng nhập sai dữ liệu",
    "auth.logout": "Đăng xuất",
    "purchase_request.create": "Tạo yêu cầu mua",
    "purchase_request.submit": "Gửi duyệt yêu cầu mua",
    "purchase_request.approve": "Phê duyệt yêu cầu mua",
    "purchase_request.reject": "Từ chối yêu cầu mua",
    "purchase_request.pay": "Xác nhận chuyển tiền",
    "transaction.create": "Tạo giao dịch",
    "transaction.update": "Chỉnh sửa giao dịch",
    "transaction.note.add": "Thêm ghi chú giao dịch",
    "category.create": "Tạo danh mục",
    "category.update": "Cập nhật danh mục",
    "category.delete": "Xóa danh mục",
    "receipt_image.create": "Tải ảnh chứng từ",
    "receipt_image.delete": "Xóa ảnh chứng từ",
    "payment_account.create": "Tạo tài khoản thanh toán",
    "payment_account.update": "Cập nhật tài khoản thanh toán",
    "settings.accountant_approval_threshold.update": "Cập nhật ngưỡng duyệt kế toán",
    "user.create": "Tạo user",
    "user.update": "Cập nhật user",
    "user.ban": "Ban user",
    "user.unban": "Mở khóa user",
    "user.delete": "Xóa user",
  };
  return labels[action] ?? action;
}

function mapEntityTypeLabel(entityType: string) {
  const labels: Record<string, string> = {
    auth_session: "Phiên đăng nhập",
    purchase_request: "Yêu cầu mua",
    transaction: "Giao dịch",
    payment_account: "Tài khoản thanh toán",
    category: "Danh mục",
    transaction_category: "Danh mục giao dịch",
    app_setting: "Cấu hình hệ thống",
    user: "Người dùng",
  };
  return labels[entityType] ?? entityType;
}

function actionBadgeClass(action: string) {
  if (action.includes("failed") || action.includes("reject")) {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }
  if (action.includes("delete")) {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  if (action.includes("login") || action.includes("logout")) {
    return "bg-sky-100 text-sky-700 border-sky-200";
  }
  if (action.includes("approve") || action.includes("pay")) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default async function LogsPage({ searchParams }: Props) {
  const user = await getSessionUser();
  const isAdmin = user?.roles.includes("ADMIN");
  if (!isAdmin) {
    redirect("/purchase-requests");
  }

  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const from = typeof query.from === "string" ? query.from : "";
  const to = typeof query.to === "string" ? query.to : "";
  const pageRaw = typeof query.page === "string" ? Number(query.page) : 1;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = 20;

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) fromDate.setHours(0, 0, 0, 0);
  if (toDate && !Number.isNaN(toDate.getTime())) toDate.setHours(23, 59, 59, 999);

  const where = {
    createdAt:
      (fromDate && !Number.isNaN(fromDate.getTime())) || (toDate && !Number.isNaN(toDate.getTime()))
        ? {
            ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
            ...(toDate && !Number.isNaN(toDate.getTime()) ? { lte: toDate } : {}),
          }
        : undefined,
    OR: q
      ? [
          { action: { contains: q, mode: "insensitive" as const } },
          { entityType: { contains: q, mode: "insensitive" as const } },
          { entityId: { contains: q, mode: "insensitive" as const } },
          { actorRoleSnapshot: { contains: q, mode: "insensitive" as const } },
          { actor: { fullName: { contains: q, mode: "insensitive" as const } } },
        ]
      : undefined,
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const buildQuery = (nextPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(nextPage));
    return `/logs?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logs hệ thống</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto_auto]">
            <div className="space-y-2">
              <Label>Tìm kiếm</Label>
              <Input name="q" defaultValue={q} placeholder="action, entity, user..." />
            </div>
            <div className="space-y-2">
              <Label>Từ ngày</Label>
              <Input type="date" name="from" defaultValue={from} />
            </div>
            <div className="space-y-2">
              <Label>Đến ngày</Label>
              <Input type="date" name="to" defaultValue={to} />
            </div>
            <Button type="submit" className="self-end">Lọc</Button>
            <Button asChild variant="ghost" className="self-end">
              <Link href="/logs">Xóa bộ lọc</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Người dùng</TableHead>
                <TableHead>Hành động</TableHead>
                <TableHead>Đối tượng</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>User-Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: (typeof rows)[number]) => (
                <TableRow key={row.id}>
                  <TableCell>{new Date(row.createdAt).toLocaleString("vi-VN")}</TableCell>
                  <TableCell>
                    <p className="font-medium">{row.actor?.fullName ?? "SYSTEM"}</p>
                    <p className="text-xs text-muted-foreground">{row.actorId ?? "-"}</p>
                    <Badge variant="outline">{row.actorRoleSnapshot}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={actionBadgeClass(row.action)}>
                      {mapActionLabel(row.action)}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{row.action}</p>
                  </TableCell>
                  <TableCell>
                    <p>{mapEntityTypeLabel(row.entityType)}</p>
                    <p className="text-xs text-muted-foreground">{row.entityType}</p>
                    <p className="text-xs text-muted-foreground">{row.entityId}</p>
                  </TableCell>
                  <TableCell>{row.ipAddress ?? "-"}</TableCell>
                  <TableCell className="max-w-[320px] truncate text-xs">{row.userAgent ?? "-"}</TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Không có log.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Trang {page}/{totalPages} • Tổng {total} log</p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                <Link href={buildQuery(Math.max(1, page - 1))}>Trước</Link>
              </Button>
              <Button asChild size="sm" variant="outline" disabled={page >= totalPages}>
                <Link href={buildQuery(Math.min(totalPages, page + 1))}>Sau</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
