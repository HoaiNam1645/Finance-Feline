"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ExternalLink, Eye, Pencil, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CurrencyConversionDialog,
  type CurrencyConversionCandidateRequest,
  type CurrencyConversionEditingRow,
  type CurrencyConversionPaymentAccount,
} from "@/components/app/currency-conversion-dialog";

type CurrencyConversionStatus = "PENDING" | "FAILED" | "SUCCEEDED";

type PurchaseRequestRow = CurrencyConversionCandidateRequest & {
  status: string;
  kind: "PURCHASE" | "COLLECTION";
  currencyConversionCount?: number;
};

type CurrencyConversionRow = {
  id: string;
  walletPaymentAccountId: string | null;
  receivePaymentAccountId: string | null;
  walletName: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
  amountUsd: string;
  amountVnd: string;
  notes: string | null;
  transferTransactionId: string | null;
  receiveTransactionId: string | null;
  status: CurrencyConversionStatus;
  pingpongImagePath: string;
  pingpongImageName: string;
  transferImagePath: string | null;
  transferImageName: string | null;
  createdAt: string;
  decidedAt: string | null;
  creator: { fullName: string; email: string };
  decider?: { fullName: string; email: string } | null;
  walletPaymentAccount?: CurrencyConversionPaymentAccount | null;
  receivePaymentAccount?: CurrencyConversionPaymentAccount | null;
  requests: Array<{
    purchaseRequest: {
      id: string;
      title: string;
      expectedAmount: string;
      currencyCode: "VND" | "USD";
      status: string;
      requester: { fullName: string; email: string };
      category?: { name: string; parentName?: string | null } | null;
    };
  }>;
};

function statusUi(status: CurrencyConversionStatus) {
  if (status === "SUCCEEDED") {
    return { label: "Thành công", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (status === "FAILED") {
    return { label: "Thất bại", className: "border-rose-200 bg-rose-100 text-rose-700" };
  }
  return { label: "Đang chờ", className: "border-amber-200 bg-amber-100 text-amber-700" };
}

function categoryDisplayName(category: { name: string; parentName?: string | null; pathLabel?: string } | null | undefined) {
  if (!category) return "Chưa chọn";
  if (category.pathLabel) return category.pathLabel;
  return category.parentName ? `${category.parentName} / ${category.name}` : category.name;
}

async function readResponseJsonSafe<T = Record<string, unknown>>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function CurrencyConversionsManager() {
  const [rows, setRows] = useState<CurrencyConversionRow[]>([]);
  const [requestRows, setRequestRows] = useState<PurchaseRequestRow[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<CurrencyConversionPaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const [conversionResponse, requestResponse, paymentAccountResponse] = await Promise.all([
        fetch("/api/currency-conversions", { cache: "no-store" }),
        fetch("/api/purchase-requests", { cache: "no-store" }),
        fetch("/api/payment-accounts", { cache: "no-store" }),
      ]);
      const [conversionData, requestData, paymentAccountData] = await Promise.all([
        readResponseJsonSafe<{ error?: string; rows?: CurrencyConversionRow[] }>(conversionResponse),
        readResponseJsonSafe<{ error?: string; rows?: PurchaseRequestRow[] }>(requestResponse),
        readResponseJsonSafe<{ error?: string; rows?: CurrencyConversionPaymentAccount[] }>(paymentAccountResponse),
      ]);

      if (!conversionResponse.ok) {
        toast.error(conversionData.error ?? "Không tải được danh sách quy đổi");
        return;
      }
      if (!requestResponse.ok) {
        toast.error(requestData.error ?? "Không tải được yêu cầu mua");
        return;
      }
      if (!paymentAccountResponse.ok) {
        toast.error(paymentAccountData.error ?? "Không tải được tài khoản thanh toán");
        return;
      }

      setRows(Array.isArray(conversionData.rows) ? conversionData.rows : []);
      setRequestRows(Array.isArray(requestData.rows) ? requestData.rows : []);
      setPaymentAccounts(Array.isArray(paymentAccountData.rows) ? paymentAccountData.rows : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const candidateRows = useMemo(
    () => requestRows.filter((row) => row.kind === "PURCHASE" && row.status === "APPROVED" && !row.currencyConversionCount),
    [requestRows]
  );
  const viewingRow = useMemo(() => rows.find((row) => row.id === viewingId) ?? null, [rows, viewingId]);
  const editingRow = useMemo(() => rows.find((row) => row.id === editingId) ?? null, [rows, editingId]);
  const editingConversion = useMemo<CurrencyConversionEditingRow | null>(() => {
    if (!editingRow) return null;
    return {
      id: editingRow.id,
      walletPaymentAccountId: editingRow.walletPaymentAccountId,
      receivePaymentAccountId: editingRow.receivePaymentAccountId,
      amountUsd: editingRow.amountUsd,
      amountVnd: editingRow.amountVnd,
      notes: editingRow.notes,
      transferTransactionId: editingRow.transferTransactionId,
      receiveTransactionId: editingRow.receiveTransactionId,
      createdAt: editingRow.createdAt,
      pingpongImageName: editingRow.pingpongImageName,
      transferImageName: editingRow.transferImageName,
      requests: editingRow.requests.map((entry) => ({ purchaseRequest: { id: entry.purchaseRequest.id } })),
    };
  }, [editingRow]);
  // Requests already attached to the conversion being edited stay selectable alongside the free ones.
  const editingCandidateRows = useMemo(() => {
    if (!editingRow) return [];
    const attachedIds = new Set(editingRow.requests.map((entry) => entry.purchaseRequest.id));
    return requestRows.filter(
      (row) =>
        row.kind === "PURCHASE" &&
        // Already-attached requests stay listed even after they are paid, so editing the
        // conversion never silently submits a row the user cannot see.
        (attachedIds.has(row.id) || (row.status === "APPROVED" && !row.currencyConversionCount))
    );
  }, [editingRow, requestRows]);

  async function updateStatus(id: string, status: "FAILED" | "SUCCEEDED") {
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/currency-conversions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Cập nhật trạng thái thất bại");
        return;
      }
      toast.success(status === "SUCCEEDED" ? "Đã đánh dấu thành công" : "Đã đánh dấu thất bại");
      await loadRows();
    } finally {
      setUpdatingId(null);
    }
  }

  function conversionWalletLabel(row: CurrencyConversionRow) {
    return row.walletPaymentAccount
      ? `${row.walletPaymentAccount.accountName} - ${row.walletPaymentAccount.accountNumber}`
      : row.walletName;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quy đổi tiền tệ</h1>
          <p className="text-sm text-muted-foreground">Theo dõi các lệnh quy đổi USD từ ví PingPong.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Làm mới
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setDialogOpen(true);
              void loadRows();
            }}
          >
            <RefreshCcw className="mr-2 size-4" />
            Quy đổi tiền tệ
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách lệnh quy đổi</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Ví PingPong</TableHead>
                <TableHead>Tài khoản nhận</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Yêu cầu mua</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ảnh</TableHead>
                <TableHead>Người tạo / xử lý</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = statusUi(row.status);
                const walletLabel = conversionWalletLabel(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top text-sm">{new Date(row.createdAt).toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="align-top">
                      <p className="text-sm font-medium">{walletLabel}</p>
                      <p className="text-xs text-muted-foreground">#{row.id.slice(-6).toUpperCase()}</p>
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      <p className="font-medium">{row.bankName}</p>
                      <p>{row.accountNumber}</p>
                      <p className="text-xs text-muted-foreground">{row.ownerName}</p>
                    </TableCell>
                    <TableCell className="align-top font-medium">
                      <p>{Number(row.amountUsd).toLocaleString("vi-VN")} USD</p>
                      <p className="text-xs text-muted-foreground">
                        Nhận: {Number(row.amountVnd).toLocaleString("vi-VN")} VND
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[300px] align-top">
                      <div className="space-y-2">
                        {row.requests.map((entry) => (
                          <div key={entry.purchaseRequest.id} className="text-sm">
                            <p className="font-medium">{entry.purchaseRequest.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.purchaseRequest.requester.fullName} • {categoryDisplayName(entry.purchaseRequest.category)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {Number(entry.purchaseRequest.expectedAmount).toLocaleString("vi-VN")} {entry.purchaseRequest.currencyCode}
                            </p>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge className={status.className} variant="outline">
                        {status.label}
                      </Badge>
                      {row.decidedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(row.decidedAt).toLocaleString("vi-VN")}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex gap-2">
                        <a href={row.pingpongImagePath} target="_blank" rel="noreferrer">
                          <Image
                            src={row.pingpongImagePath}
                            alt={row.pingpongImageName}
                            width={40}
                            height={40}
                            unoptimized
                            className="size-10 rounded-md border object-cover transition hover:opacity-85"
                          />
                        </a>
                        {row.transferImagePath && row.transferImageName ? (
                          <a href={row.transferImagePath} target="_blank" rel="noreferrer">
                            <Image
                              src={row.transferImagePath}
                              alt={row.transferImageName}
                              width={40}
                              height={40}
                              unoptimized
                              className="size-10 rounded-md border object-cover transition hover:opacity-85"
                            />
                          </a>
                        ) : (
                          <span className="flex size-10 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      <p>{row.creator.fullName}</p>
                      <p className="text-xs text-muted-foreground">{row.creator.email}</p>
                      {row.decider ? (
                        <p className="mt-2 text-xs text-muted-foreground">Xử lý: {row.decider.fullName}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setViewingId(row.id)}>
                          <Eye className="mr-2 size-4" />
                          Chi tiết
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(row.id)}>
                          <Pencil className="mr-2 size-4" />
                          Sửa
                        </Button>
                        {row.status === "PENDING" ? (
                          <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingId === row.id}
                            onClick={() => void updateStatus(row.id, "FAILED")}
                          >
                            Thất bại
                          </Button>
                          <Button size="sm" disabled={updatingId === row.id} onClick={() => void updateStatus(row.id, "SUCCEEDED")}>
                            Thành công
                          </Button>
                          </>
                        ) : null}
                      </div>
                      {row.status !== "PENDING" ? <p className="mt-2 text-sm text-muted-foreground">Đã xử lý</p> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Chưa có lệnh quy đổi tiền tệ nào.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(viewingRow)} onOpenChange={(open) => !open && setViewingId(null)}>
        <DialogContent className="overflow-y-auto sm:max-w-5xl">
          {viewingRow ? (
            <>
              <DialogHeader>
                <DialogTitle>Chi tiết lệnh quy đổi #{viewingRow.id.slice(-6).toUpperCase()}</DialogTitle>
                <DialogDescription>
                  {new Date(viewingRow.createdAt).toLocaleString("vi-VN")} - {Number(viewingRow.amountUsd).toLocaleString("vi-VN")} USD
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Trạng thái</p>
                    <Badge className={statusUi(viewingRow.status).className} variant="outline">
                      {statusUi(viewingRow.status).label}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{viewingRow.creator.fullName}</p>
                    <p className="text-muted-foreground">{viewingRow.creator.email}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-muted-foreground">Người xử lý</p>
                    <p className="font-medium">{viewingRow.decider?.fullName ?? "-"}</p>
                    {viewingRow.decidedAt ? (
                      <p className="text-muted-foreground">{new Date(viewingRow.decidedAt).toLocaleString("vi-VN")}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <h3 className="mb-3 text-sm font-semibold">Ví PingPong</h3>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Ví:</span> {conversionWalletLabel(viewingRow)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Ngân hàng:</span>{" "}
                        {viewingRow.walletPaymentAccount?.bankName ?? "PingPong"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Chủ ví:</span>{" "}
                        {viewingRow.walletPaymentAccount?.ownerName ?? "-"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-md border p-4">
                    <h3 className="mb-3 text-sm font-semibold">Tài khoản nhận</h3>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">Ngân hàng:</span> {viewingRow.bankName}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Số tài khoản:</span> {viewingRow.accountNumber}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Chủ tài khoản:</span> {viewingRow.ownerName}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Số tiền quy đổi:</span>{" "}
                        <span className="font-semibold">{Number(viewingRow.amountUsd).toLocaleString("vi-VN")} USD</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Số tiền nhận:</span>{" "}
                        <span className="font-semibold">{Number(viewingRow.amountVnd).toLocaleString("vi-VN")} VND</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Notes:</span> {viewingRow.notes || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Ảnh chứng từ</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Ảnh ví PingPong</p>
                        <Button size="sm" variant="outline" asChild>
                          <a href={viewingRow.pingpongImagePath} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 size-4" />
                            Mở ảnh
                          </a>
                        </Button>
                      </div>
                      <a href={viewingRow.pingpongImagePath} target="_blank" rel="noreferrer" className="block">
                        <Image
                          src={viewingRow.pingpongImagePath}
                          alt={viewingRow.pingpongImageName}
                          width={800}
                          height={520}
                          unoptimized
                          className="max-h-[360px] w-full rounded-md border object-contain"
                        />
                      </a>
                      <p className="truncate text-xs text-muted-foreground">{viewingRow.pingpongImageName}</p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Mã giao dịch chuyển:</span>{" "}
                        {viewingRow.transferTransactionId || "-"}
                      </p>
                    </div>

                    <div className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Ảnh phí trung gian</p>
                        {viewingRow.transferImagePath ? (
                          <Button size="sm" variant="outline" asChild>
                            <a href={viewingRow.transferImagePath} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 size-4" />
                              Mở ảnh
                            </a>
                          </Button>
                        ) : null}
                      </div>
                      {viewingRow.transferImagePath && viewingRow.transferImageName ? (
                        <>
                          <a href={viewingRow.transferImagePath} target="_blank" rel="noreferrer" className="block">
                            <Image
                              src={viewingRow.transferImagePath}
                              alt={viewingRow.transferImageName}
                              width={800}
                              height={520}
                              unoptimized
                              className="max-h-[360px] w-full rounded-md border object-contain"
                            />
                          </a>
                          <p className="truncate text-xs text-muted-foreground">{viewingRow.transferImageName}</p>
                        </>
                      ) : (
                        <div className="flex min-h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                          Chưa có ảnh phí trung gian
                        </div>
                      )}
                      <p className="text-sm">
                        <span className="text-muted-foreground">Mã giao dịch nhận:</span>{" "}
                        {viewingRow.receiveTransactionId || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Yêu cầu mua gắn kèm ({viewingRow.requests.length})</h3>
                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    {viewingRow.requests.map((entry) => (
                      <div key={entry.purchaseRequest.id} className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[1fr_160px_150px]">
                        <div className="min-w-0">
                          <p className="font-medium">{entry.purchaseRequest.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.purchaseRequest.requester.fullName} - {entry.purchaseRequest.requester.email}
                          </p>
                          <p className="text-sm text-muted-foreground">{categoryDisplayName(entry.purchaseRequest.category)}</p>
                        </div>
                        <div className="text-sm">
                          <p className="text-muted-foreground">Số tiền</p>
                          <p className="font-medium">
                            {Number(entry.purchaseRequest.expectedAmount).toLocaleString("vi-VN")} {entry.purchaseRequest.currencyCode}
                          </p>
                        </div>
                        <div className="text-sm">
                          <p className="text-muted-foreground">Trạng thái yêu cầu</p>
                          <p className="font-medium">{entry.purchaseRequest.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button size="sm" variant="outline" onClick={() => setViewingId(null)}>
                  Đóng
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(viewingRow.id);
                    setViewingId(null);
                  }}
                >
                  <Pencil className="mr-2 size-4" />
                  Sửa
                </Button>
                {viewingRow.status === "PENDING" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === viewingRow.id}
                      onClick={() => void updateStatus(viewingRow.id, "FAILED")}
                    >
                      Thất bại
                    </Button>
                    <Button
                      size="sm"
                      disabled={updatingId === viewingRow.id}
                      onClick={() => void updateStatus(viewingRow.id, "SUCCEEDED")}
                    >
                      Thành công
                    </Button>
                  </>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <CurrencyConversionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        candidateRows={candidateRows}
        paymentAccounts={paymentAccounts}
        onCreated={loadRows}
      />

      {editingConversion ? (
        <CurrencyConversionDialog
          key={editingConversion.id}
          open
          onOpenChange={(open) => !open && setEditingId(null)}
          candidateRows={editingCandidateRows}
          paymentAccounts={paymentAccounts}
          conversion={editingConversion}
          onCreated={loadRows}
        />
      ) : null}
    </div>
  );
}
