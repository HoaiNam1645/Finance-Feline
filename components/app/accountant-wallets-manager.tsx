"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, PlusCircle, RefreshCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type WalletEntry = {
  id: string;
  sourceType: "CONVERSION" | "TRANSACTION";
  direction: "IN" | "OUT";
  title: string;
  amountUsd: number;
  balanceAfterUsd: number;
  occurredAt: string;
  status: string;
  reference: string | null;
  note: string | null;
  paymentAccountName: string | null;
  requestedUsd: number | null;
  receivedVnd: number | null;
};

type WalletRow = {
  userId: string;
  fullName: string;
  email: string;
  balanceUsd: number;
  totalInUsd: number;
  totalOutUsd: number;
  conversionHistory: WalletEntry[];
  transactionHistory: WalletEntry[];
};

type WalletsManagerProps = {
  endpoint: string;
  title: string;
  description: string;
};

type DepositConversion = {
  id: string;
  amountUsd: string;
  actualReceivedUsd: string | null;
  remainingUsd: number;
  walletName: string;
  decidedAt: string | null;
  createdAt: string;
};

const usdFormatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const vndFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function usd(value: number) {
  return `${usdFormatter.format(value)} USD`;
}

export function AccountantWalletsManager({ endpoint, title, description }: WalletsManagerProps) {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingEntryId, setViewingEntryId] = useState<string | null>(null);
  const [depositingWallet, setDepositingWallet] = useState<WalletRow | null>(null);
  const [depositOptions, setDepositOptions] = useState<DepositConversion[]>([]);
  const [depositConversionId, setDepositConversionId] = useState("");
  const [depositAmountInput, setDepositAmountInput] = useState("");
  const [depositing, setDepositing] = useState(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { error?: string; rows?: WalletRow[] };
      if (!response.ok) {
        toast.error(data.error ?? `Không tải được ${title}`);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } finally {
      setLoading(false);
    }
  }, [endpoint, title]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const viewingWallet = useMemo(
    () => rows.find((row) => row.userId === viewingUserId) ?? null,
    [rows, viewingUserId]
  );
  const viewingEntry = useMemo(
    () =>
      [...(viewingWallet?.conversionHistory ?? []), ...(viewingWallet?.transactionHistory ?? [])].find(
        (entry) => `${entry.sourceType}-${entry.id}` === viewingEntryId
      ) ?? null,
    [viewingEntryId, viewingWallet]
  );
  const selectedDepositConversion = useMemo(
    () => depositOptions.find((conversion) => conversion.id === depositConversionId) ?? null,
    [depositConversionId, depositOptions]
  );

  async function openDeposit(wallet: WalletRow) {
    setDepositingWallet(wallet);
    setDepositOptions([]);
    setDepositConversionId("");
    setDepositAmountInput("");
    const response = await fetch(`/api/wallet-deposits?ownerId=${encodeURIComponent(wallet.userId)}`, { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { error?: string; rows?: DepositConversion[] };
    if (!response.ok) {
      toast.error(data.error ?? "Không tải được lệnh quy đổi");
      setDepositingWallet(null);
      return;
    }
    const options = Array.isArray(data.rows) ? data.rows : [];
    setDepositOptions(options);
    setDepositConversionId(options[0]?.id ?? "");
  }

  async function submitDeposit() {
    const amountUsd = Number(depositAmountInput);
    if (!depositConversionId) {
      toast.error("Vui lòng chọn lệnh quy đổi");
      return;
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      toast.error("Số tiền nạp phải lớn hơn 0");
      return;
    }
    if (selectedDepositConversion && amountUsd > selectedDepositConversion.remainingUsd) {
      toast.error(`Chỉ còn có thể nạp ${usd(selectedDepositConversion.remainingUsd)}`);
      return;
    }

    setDepositing(true);
    try {
      const response = await fetch("/api/wallet-deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversionId: depositConversionId, amountUsd }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Nạp tiền thất bại");
        return;
      }
      toast.success(`Đã nạp ${usd(amountUsd)} vào ví`);
      setDepositingWallet(null);
      await loadRows();
    } finally {
      setDepositing(false);
    }
  }

  function historyTable(entries: WalletEntry[], emptyMessage: string, kind: "conversion" | "transaction") {
    return (
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="text-right">Phát sinh</TableHead>
              <TableHead className="text-right">Số dư sau GD</TableHead>
              <TableHead className="text-right">Chi tiết</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={`${entry.sourceType}-${entry.id}`}>
                <TableCell className="whitespace-nowrap">{new Date(entry.occurredAt).toLocaleString("vi-VN")}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={entry.direction === "IN" ? "text-emerald-700" : "text-rose-700"}>
                    {kind === "conversion" ? "Vào ví" : entry.direction === "IN" ? "Thu" : "Chi"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">#{entry.id.slice(-6).toUpperCase()}</p>
                </TableCell>
                <TableCell className={`text-right font-semibold ${entry.direction === "IN" ? "text-emerald-700" : "text-rose-700"}`}>
                  {entry.direction === "IN" ? "+" : "-"}{usd(entry.amountUsd)}
                </TableCell>
                <TableCell className="text-right font-medium">{usd(entry.balanceAfterUsd)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setViewingEntryId(`${entry.sourceType}-${entry.id}`)}>
                    Xem
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!entries.length ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wallet className="size-6" />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadRows()} disabled={loading}>
          <RefreshCcw className="mr-2 size-4" />
          Làm mới
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ví cá nhân</CardTitle>
          <CardDescription>Số dư được cộng từ quy đổi và giao dịch thu, sau đó trừ các giao dịch chi USD.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[850px]">
            <TableHeader>
              <TableRow>
                <TableHead>Chủ ví</TableHead>
                <TableHead className="text-right">Tổng tiền vào</TableHead>
                <TableHead className="text-right">Tổng đã chi</TableHead>
                <TableHead className="text-right">Số dư</TableHead>
                <TableHead className="text-right">Phát sinh</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((wallet) => (
                <TableRow key={wallet.userId}>
                  <TableCell>
                    <p className="font-medium">{wallet.fullName}</p>
                    <p className="text-xs text-muted-foreground">{wallet.email}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-emerald-700">
                    +{usd(wallet.totalInUsd)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-rose-700">
                    -{usd(wallet.totalOutUsd)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${
                      wallet.balanceUsd < 0 ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {usd(wallet.balanceUsd)}
                  </TableCell>
                  <TableCell className="text-right">{wallet.conversionHistory.length + wallet.transactionHistory.length}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => void openDeposit(wallet)}>
                        <PlusCircle className="mr-2 size-4" />
                        Nạp tiền
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setViewingUserId(wallet.userId)}>
                        <Eye className="mr-2 size-4" />
                        Chi tiết
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Chưa có chủ ví phù hợp.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(depositingWallet)} onOpenChange={(open) => !open && !depositing && setDepositingWallet(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nạp tiền vào ví</DialogTitle>
            <DialogDescription>
              {depositingWallet ? `${depositingWallet.fullName} · ${depositingWallet.email}` : "Chọn lệnh quy đổi để bổ sung tiền thực nhận."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lệnh quy đổi thành công</Label>
              <Select value={depositConversionId} onValueChange={setDepositConversionId} disabled={depositing}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn lệnh quy đổi" />
                </SelectTrigger>
                <SelectContent>
                  {depositOptions.map((conversion) => (
                    <SelectItem key={conversion.id} value={conversion.id}>
                      #{conversion.id.slice(-6).toUpperCase()} · {usd(Number(conversion.amountUsd))} · còn {usd(conversion.remainingUsd)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!depositOptions.length ? (
                <p className="text-sm text-muted-foreground">Không có lệnh quy đổi thành công nào đang chờ bổ sung tiền.</p>
              ) : null}
            </div>
            {selectedDepositConversion ? (
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm">
                <div><p className="text-muted-foreground">Đã nạp</p><p className="font-medium">{usd(Number(selectedDepositConversion.actualReceivedUsd ?? 0))}</p></div>
                <div><p className="text-muted-foreground">Còn có thể nạp</p><p className="font-medium">{usd(selectedDepositConversion.remainingUsd)}</p></div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="wallet-deposit-amount">Số USD thực nhận bổ sung</Label>
              <Input
                id="wallet-deposit-amount"
                type="number"
                min={0}
                max={selectedDepositConversion?.remainingUsd}
                step="0.01"
                value={depositAmountInput}
                onChange={(event) => setDepositAmountInput(event.target.value)}
                placeholder="Nhập số USD muốn nạp"
                disabled={depositing || !selectedDepositConversion}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositingWallet(null)} disabled={depositing}>Hủy</Button>
            <Button onClick={() => void submitDeposit()} disabled={depositing || !selectedDepositConversion}>
              {depositing ? "Đang nạp..." : "Nạp tiền"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingWallet)} onOpenChange={(open) => !open && setViewingUserId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl">
          {viewingWallet ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewingWallet.fullName}</DialogTitle>
                <DialogDescription>{viewingWallet.email} · Số dư {usd(viewingWallet.balanceUsd)}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Tổng tiền vào</p>
                  <p className="font-semibold text-emerald-700">+{usd(viewingWallet.totalInUsd)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Tổng đã chi từ ví</p>
                  <p className="font-semibold text-rose-700">-{usd(viewingWallet.totalOutUsd)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Số dư</p>
                  <p className="font-semibold">{usd(viewingWallet.balanceUsd)}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 font-semibold">Lịch sử quy đổi vào ví</h3>
                  <p className="mb-3 text-sm text-muted-foreground">Chỉ hiển thị USD thực nhận từ các phiếu quy đổi thành công.</p>
                  {historyTable(viewingWallet.conversionHistory, "Chưa có khoản quy đổi nào vào ví.", "conversion")}
                </div>
                <div>
                  <h3 className="mb-2 font-semibold">Lịch sử sử dụng Thu/Chi</h3>
                  <p className="mb-3 text-sm text-muted-foreground">Hiển thị riêng các giao dịch thu và chi USD do người dùng xác nhận.</p>
                  {historyTable(viewingWallet.transactionHistory, "Chưa có giao dịch thu/chi.", "transaction")}
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setViewingUserId(null)}>Đóng</Button></DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingEntry)} onOpenChange={(open) => !open && setViewingEntryId(null)}>
        <DialogContent className="sm:max-w-xl">
          {viewingEntry ? (
            <>
              <DialogHeader>
                <DialogTitle>Chi tiết {viewingEntry.direction === "IN" ? "khoản thu" : "khoản chi"}</DialogTitle>
                <DialogDescription>#{viewingEntry.id.slice(-6).toUpperCase()} · {new Date(viewingEntry.occurredAt).toLocaleString("vi-VN")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
                <div><p className="text-muted-foreground">Số tiền</p><p className="font-semibold">{viewingEntry.direction === "IN" ? "+" : "-"}{usd(viewingEntry.amountUsd)}</p></div>
                <div><p className="text-muted-foreground">Số dư sau giao dịch</p><p className="font-semibold">{usd(viewingEntry.balanceAfterUsd)}</p></div>
                <div className="sm:col-span-2"><p className="text-muted-foreground">Nội dung</p><p className="font-medium">{viewingEntry.title}</p></div>
                {viewingEntry.requestedUsd != null ? <div><p className="text-muted-foreground">USD yêu cầu</p><p>{usd(viewingEntry.requestedUsd)}</p></div> : null}
                {viewingEntry.receivedVnd != null ? <div><p className="text-muted-foreground">VND nhận</p><p>{vndFormatter.format(viewingEntry.receivedVnd)} VND</p></div> : null}
                <div className="sm:col-span-2"><p className="text-muted-foreground">Tài khoản / ví</p><p>{viewingEntry.paymentAccountName ?? "-"}</p></div>
                <div><p className="text-muted-foreground">Mã tham chiếu</p><p>{viewingEntry.reference ?? "-"}</p></div>
                <div><p className="text-muted-foreground">Trạng thái</p><p>{viewingEntry.status}</p></div>
                {viewingEntry.note ? <div className="sm:col-span-2"><p className="text-muted-foreground">Ghi chú</p><p className="whitespace-pre-wrap">{viewingEntry.note}</p></div> : null}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setViewingEntryId(null)}>Đóng</Button></DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
