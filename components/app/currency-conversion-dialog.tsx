"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptImageUploader } from "@/components/app/receipt-image-uploader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CurrencyConversionPaymentAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
};

const PINGPONG_BANK_NAME = "PingPong";

export type CurrencyConversionEditingRow = {
  id: string;
  walletPaymentAccountId: string | null;
  receivePaymentAccountId: string | null;
  amountUsd: string;
  amountVnd: string;
  notes: string | null;
  transferTransactionId: string | null;
  receiveTransactionId: string | null;
  createdAt: string;
  pingpongImageName: string;
  transferImageName: string | null;
  requests: Array<{ purchaseRequest: { id: string } }>;
};

function toDateTimeLocalValue(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

export type CurrencyConversionCandidateRequest = {
  id: string;
  createdAt: string;
  title: string;
  expectedAmount: string;
  currencyCode: "VND" | "USD";
  requester: { id: string; fullName: string; email: string };
  category?: { id: string; name: string; parentName?: string | null } | null;
};

type CurrencyConversionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateRows: CurrencyConversionCandidateRequest[];
  paymentAccounts: CurrencyConversionPaymentAccount[];
  conversion?: CurrencyConversionEditingRow | null;
  /** Giữ cửa sổ mở khi đang chạy hướng dẫn. */
  lockClose?: boolean;
  onCreated?: () => void | Promise<void>;
};

function categoryDisplayName(
  category: Pick<NonNullable<CurrencyConversionCandidateRequest["category"]>, "name" | "parentName"> & { pathLabel?: string }
) {
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

export function CurrencyConversionDialog({
  open,
  onOpenChange,
  candidateRows,
  paymentAccounts,
  conversion = null,
  lockClose = false,
  onCreated,
}: CurrencyConversionDialogProps) {
  const isEditing = Boolean(conversion);
  const [walletAccountId, setWalletAccountId] = useState("");
  const [receiveAccountId, setReceiveAccountId] = useState("");
  const [amountVndInput, setAmountVndInput] = useState("");
  const [notes, setNotes] = useState("");
  const [transferTransactionId, setTransferTransactionId] = useState("");
  const [receiveTransactionId, setReceiveTransactionId] = useState("");
  const [amountUsdInput, setAmountUsdInput] = useState("");
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [requestSearch, setRequestSearch] = useState("");
  const [pingpongFiles, setPingpongFiles] = useState<File[]>([]);
  const [transferFiles, setTransferFiles] = useState<File[]>([]);
  const [createdAtInput, setCreatedAtInput] = useState("");
  const [removeTransferImage, setRemoveTransferImage] = useState(false);
  const [creating, setCreating] = useState(false);

  const pingpongWalletAccounts = useMemo(
    () =>
      paymentAccounts
        .filter((account) => account.bankName === PINGPONG_BANK_NAME)
        .toSorted((a, b) => a.accountName.localeCompare(b.accountName, "vi")),
    [paymentAccounts]
  );
  const receiveAccounts = useMemo(
    () =>
      paymentAccounts
        .filter((account) => account.bankName !== PINGPONG_BANK_NAME)
        .toSorted((a, b) => a.accountName.localeCompare(b.accountName, "vi")),
    [paymentAccounts]
  );
  const sortedCandidateRows = useMemo(
    () => candidateRows.toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [candidateRows]
  );
  const selectedRows = useMemo(() => {
    const selectedIds = new Set(selectedRequestIds);
    return sortedCandidateRows.filter((row) => selectedIds.has(row.id));
  }, [sortedCandidateRows, selectedRequestIds]);
  const filteredCandidateRows = useMemo(() => {
    const keyword = requestSearch.trim().toLowerCase();
    if (!keyword) return sortedCandidateRows;
    const normalizedNumber = keyword.replace(/[,.\\s]/g, "");
    return sortedCandidateRows.filter((row) => {
      const category = categoryDisplayName(row.category ?? { name: "Chưa chọn", parentName: null }).toLowerCase();
      const amount = Number(row.expectedAmount).toLocaleString("vi-VN");
      return (
        row.title.toLowerCase().includes(keyword) ||
        row.requester.fullName.toLowerCase().includes(keyword) ||
        row.requester.email.toLowerCase().includes(keyword) ||
        category.includes(keyword) ||
        row.currencyCode.toLowerCase().includes(keyword) ||
        (normalizedNumber ? amount.replace(/[,.\\s]/g, "").includes(normalizedNumber) : false)
      );
    });
  }, [requestSearch, sortedCandidateRows]);
  const selectedTotalUsd = selectedRows.reduce(
    (total, row) => total + (row.currencyCode === "USD" ? Number(row.expectedAmount) : 0),
    0
  );

  useEffect(() => {
    if (!open || !conversion) return;
    setWalletAccountId(conversion.walletPaymentAccountId ?? "");
    setReceiveAccountId(conversion.receivePaymentAccountId ?? "");
    setAmountUsdInput(String(Number(conversion.amountUsd)));
    setAmountVndInput(String(Number(conversion.amountVnd)));
    setNotes(conversion.notes ?? "");
    setTransferTransactionId(conversion.transferTransactionId ?? "");
    setReceiveTransactionId(conversion.receiveTransactionId ?? "");
    setCreatedAtInput(toDateTimeLocalValue(conversion.createdAt));
    setSelectedRequestIds(conversion.requests.map((entry) => entry.purchaseRequest.id));
    setPingpongFiles([]);
    setTransferFiles([]);
    setRemoveTransferImage(false);
  }, [open, conversion]);

  useEffect(() => {
    if (!open || conversion) return;
    setWalletAccountId((current) => {
      if (current && pingpongWalletAccounts.some((account) => account.id === current)) return current;
      return pingpongWalletAccounts[0]?.id ?? "";
    });
    setReceiveAccountId((current) => (current && receiveAccounts.some((account) => account.id === current) ? current : ""));
    setSelectedRequestIds((current) => current.filter((id) => sortedCandidateRows.some((row) => row.id === id)));
  }, [open, conversion, pingpongWalletAccounts, receiveAccounts, sortedCandidateRows]);

  function resetForm() {
    setWalletAccountId("");
    setReceiveAccountId("");
    setAmountVndInput("");
    setNotes("");
    setTransferTransactionId("");
    setReceiveTransactionId("");
    setAmountUsdInput("");
    setSelectedRequestIds([]);
    setRequestSearch("");
    setPingpongFiles([]);
    setTransferFiles([]);
    setCreatedAtInput("");
    setRemoveTransferImage(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) resetForm();
  }

  function toggleRequest(id: string) {
    setSelectedRequestIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submitCurrencyConversion() {
    const amountUsd = Number(amountUsdInput);
    const amountVnd = Number(amountVndInput);
    if (!walletAccountId) {
      toast.error("Vui lòng chọn ví PingPong");
      return;
    }
    if (!receiveAccountId) {
      toast.error("Vui lòng chọn ngân hàng nhận");
      return;
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      toast.error("Số tiền quy đổi USD phải lớn hơn 0");
      return;
    }
    if (!Number.isFinite(amountVnd) || amountVnd <= 0) {
      toast.error("Số tiền nhận VND phải lớn hơn 0");
      return;
    }
    if (!isEditing && !pingpongFiles[0]) {
      toast.error("Vui lòng tải ảnh ví PingPong");
      return;
    }
    const createdAt = isEditing ? new Date(createdAtInput) : null;
    if (isEditing && (!createdAtInput || Number.isNaN(createdAt?.getTime() ?? NaN))) {
      toast.error("Thời gian tạo không hợp lệ");
      return;
    }

    const formData = new FormData();
    formData.set("walletPaymentAccountId", walletAccountId);
    formData.set("receivePaymentAccountId", receiveAccountId);
    formData.set("amountUsd", String(amountUsd));
    formData.set("amountVnd", String(amountVnd));
    formData.set("notes", notes.trim());
    formData.set("transferTransactionId", transferTransactionId.trim());
    formData.set("receiveTransactionId", receiveTransactionId.trim());
    selectedRequestIds.forEach((id) => formData.append("requestIds", id));
    if (pingpongFiles[0]) {
      formData.set("pingpongImage", pingpongFiles[0]);
    }
    if (transferFiles[0]) {
      formData.set("transferImage", transferFiles[0]);
    }
    if (isEditing && createdAt) {
      formData.set("createdAt", createdAt.toISOString());
      formData.set("removeTransferImage", String(removeTransferImage && !transferFiles[0]));
    }

    setCreating(true);
    try {
      const response = await fetch(
        isEditing && conversion ? `/api/currency-conversions/${conversion.id}` : "/api/currency-conversions",
        {
          method: isEditing ? "PATCH" : "POST",
          body: formData,
        }
      );
      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? (isEditing ? "Cập nhật phiếu quy đổi thất bại" : "Tạo phiếu quy đổi thất bại"));
        return;
      }

      toast.success(isEditing ? "Đã cập nhật phiếu quy đổi" : "Đã tạo phiếu quy đổi tiền tệ");
      handleOpenChange(false);
      await onCreated?.();
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(event) => {
          if (lockClose) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (lockClose) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? "Sửa lệnh quy đổi tiền tệ" : "Quy đổi tiền tệ"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Cập nhật thông tin lệnh quy đổi, ảnh chứng từ và thời gian tạo."
              : "Ghi nhận thông tin quy đổi USD từ ví PingPong và gắn với các yêu cầu mua đang chờ chuyển khoản."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2" data-tour="conversion-wallet">
            <div className="space-y-2">
              <Label>Tên ví PingPong</Label>
              <Select value={walletAccountId} onValueChange={setWalletAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn ví PingPong" />
                </SelectTrigger>
                <SelectContent>
                  {pingpongWalletAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.accountName} - {account.accountNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!pingpongWalletAccounts.length ? (
                <p className="text-xs text-muted-foreground">Chưa có tài khoản thanh toán nào có ngân hàng là PingPong.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Số tiền quy đổi (USD)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountUsdInput}
                onChange={(event) => setAmountUsdInput(event.target.value)}
                placeholder="Nhập số USD cần quy đổi"
              />
            </div>
            <div className="space-y-2">
              <Label>Ngân hàng nhận</Label>
              <Select value={receiveAccountId} onValueChange={setReceiveAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn tài khoản nhận" />
                </SelectTrigger>
                <SelectContent>
                  {receiveAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.bankName} - {account.accountNumber} ({account.ownerName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!receiveAccounts.length ? (
                <p className="text-xs text-muted-foreground">Chưa có tài khoản thanh toán nào ngoài ví PingPong.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Số tiền nhận (VND)</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={amountVndInput}
                onChange={(event) => setAmountVndInput(event.target.value)}
                placeholder="Nhập số VND thực nhận"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ghi chú thêm (không bắt buộc)" />
            </div>
            {isEditing ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="conversion-created-at">Thời gian tạo</Label>
                <Input
                  id="conversion-created-at"
                  type="datetime-local"
                  step="1"
                  value={createdAtInput}
                  onChange={(event) => setCreatedAtInput(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2" data-tour="conversion-requests">
            <div className="flex items-center justify-between gap-2">
              <Label>Yêu cầu mua đang chờ chuyển khoản (không bắt buộc)</Label>
              <p className="text-xs text-muted-foreground">
                Không bắt buộc · Đã chọn {selectedRequestIds.length} yêu cầu
                {selectedTotalUsd > 0 ? ` • Tổng USD: ${selectedTotalUsd.toLocaleString("vi-VN")}` : ""}
              </p>
            </div>
            <Input
              value={requestSearch}
              onChange={(event) => setRequestSearch(event.target.value)}
              placeholder="Tìm theo tiêu đề, người tạo, danh mục, số tiền"
            />
            {sortedCandidateRows.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {filteredCandidateRows.map((row) => {
                  const checked = selectedRequestIds.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={`flex cursor-pointer items-start gap-3 border-b px-3 py-2 last:border-b-0 ${
                        checked ? "bg-muted/60" : "hover:bg-muted/40"
                      }`}
                    >
                      <input type="checkbox" className="mt-1 size-4" checked={checked} onChange={() => toggleRequest(row.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{row.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.requester.fullName} • {categoryDisplayName(row.category ?? { name: "Chưa chọn", parentName: null })}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-sm font-medium">
                        {Number(row.expectedAmount).toLocaleString("vi-VN")} {row.currencyCode}
                      </span>
                    </label>
                  );
                })}
                {!filteredCandidateRows.length ? (
                  <div className="p-4 text-sm text-muted-foreground">Không tìm thấy yêu cầu phù hợp.</div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Chưa có yêu cầu mua nào đã duyệt và đang chờ chuyển khoản. Vẫn lưu được phiếu quy đổi, gắn yêu cầu sau
                bằng nút Sửa.
              </div>
            )}
          </div>

          <div className="grid items-stretch gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Ảnh ví PingPong</Label>
              <ReceiptImageUploader
                files={pingpongFiles}
                onFilesChange={(files) => setPingpongFiles(files.slice(-1))}
                disabled={creating}
                chooseButtonLabel="Chọn ảnh ví"
                hint={
                  isEditing
                    ? "Chọn ảnh mới để thay thế, để trống nếu giữ ảnh hiện tại."
                    : "Tải 1 ảnh màn hình ví PingPong."
                }
              />
              {isEditing && conversion && !pingpongFiles.length ? (
                <p className="truncate text-xs text-muted-foreground">Ảnh hiện tại: {conversion.pingpongImageName}</p>
              ) : null}
              <div className="mt-auto space-y-2 pt-2">
                <Label htmlFor="transfer-transaction-id">Mã giao dịch chuyển</Label>
                <Input
                  id="transfer-transaction-id"
                  value={transferTransactionId}
                  onChange={(event) => setTransferTransactionId(event.target.value)}
                  disabled={creating}
                  placeholder="Transaction ID phía chuyển"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Ảnh phí trung gian</Label>
              <ReceiptImageUploader
                files={transferFiles}
                onFilesChange={(files) => setTransferFiles(files.slice(-1))}
                disabled={creating}
                chooseButtonLabel="Chọn ảnh phí"
                hint="Không bắt buộc, có thể bổ sung sau khi đã chỉnh ảnh."
              />
              {isEditing && conversion?.transferImageName && !transferFiles.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    Ảnh hiện tại: {removeTransferImage ? "sẽ bị xóa" : conversion.transferImageName}
                  </p>
                  <Button
                    type="button"
                    size="xs"
                    variant={removeTransferImage ? "outline" : "destructive"}
                    disabled={creating}
                    onClick={() => setRemoveTransferImage((current) => !current)}
                  >
                    {removeTransferImage ? "Giữ lại" : "Xóa ảnh"}
                  </Button>
                </div>
              ) : null}
              <div className="mt-auto space-y-2 pt-2">
                <Label htmlFor="receive-transaction-id">Mã giao dịch nhận</Label>
                <Input
                  id="receive-transaction-id"
                  value={receiveTransactionId}
                  onChange={(event) => setReceiveTransactionId(event.target.value)}
                  disabled={creating}
                  placeholder="Transaction ID phía nhận"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => handleOpenChange(false)}>
            Hủy
          </Button>
          <Button
            size="sm"
            disabled={creating}
            onClick={() => void submitCurrencyConversion()}
          >
            {creating ? "Đang lưu..." : isEditing ? "Cập nhật phiếu quy đổi" : "Lưu phiếu quy đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
