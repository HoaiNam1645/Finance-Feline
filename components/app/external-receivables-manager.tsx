"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Eye, Pencil, Plus, ReceiptText, RefreshCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ExternalReceivableStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELLED";

type ExternalParty = {
  id: string;
  name: string;
  type: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  note: string | null;
};

type PaymentAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
};

type ExternalReceivablePayment = {
  id: string;
  amountOriginal: string;
  currencyCode: "VND" | "USD";
  amountVnd: string;
  paymentDate: string;
  note: string | null;
  receiptImagePath: string | null;
  receiptImageName: string | null;
  paymentAccount?: PaymentAccount | null;
  creator: { fullName: string; email: string };
};

type ExternalReceivableRow = {
  id: string;
  title: string;
  description: string | null;
  amountOriginal: string;
  currencyCode: "VND" | "USD";
  amountVnd: string;
  paidAmountVnd: number;
  remainingAmountVnd: number;
  occurredAt: string;
  dueDate: string | null;
  status: ExternalReceivableStatus;
  party: ExternalParty;
  creator: { fullName: string; email: string };
  payments: ExternalReceivablePayment[];
};

const PARTY_TYPES = [
  { value: "SUPPLIER", label: "Supplier" },
  { value: "WORKSHOP", label: "Xưởng" },
  { value: "OUTSIDE_TEAM", label: "Team ngoài" },
  { value: "CUSTOMER", label: "Khách hàng" },
  { value: "OTHER", label: "Khác" },
];

function money(value: number, currency = "VND") {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: currency === "VND" ? 0 : 2 })} ${currency}`;
}

function dateValue(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
  return value ? new Date(`${value}T00:00:00.000`).toISOString() : undefined;
}

function statusUi(status: ExternalReceivableStatus) {
  if (status === "PAID") return { label: "Đã thu đủ", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  if (status === "PARTIAL") return { label: "Thu một phần", className: "border-blue-200 bg-blue-100 text-blue-700" };
  if (status === "CANCELLED") return { label: "Đã hủy", className: "border-slate-200 bg-slate-100 text-slate-700" };
  return { label: "Đang nợ", className: "border-amber-200 bg-amber-100 text-amber-700" };
}

function partyTypeLabel(type: string) {
  return PARTY_TYPES.find((item) => item.value === type)?.label ?? type;
}

async function readResponseJsonSafe<T = Record<string, unknown>>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function ExternalReceivablesManager() {
  const [rows, setRows] = useState<ExternalReceivableRow[]>([]);
  const [parties, setParties] = useState<ExternalParty[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [createDebtOpen, setCreateDebtOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<ExternalReceivableRow | null>(null);
  const [viewingRow, setViewingRow] = useState<ExternalReceivableRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ExternalReceivableRow | null>(null);
  const [deletePartyTarget, setDeletePartyTarget] = useState<ExternalParty | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState("");
  const [partyType, setPartyType] = useState("OTHER");
  const [partyContactName, setPartyContactName] = useState("");
  const [partyContactPhone, setPartyContactPhone] = useState("");
  const [partyNote, setPartyNote] = useState("");

  const [debtPartyId, setDebtPartyId] = useState("");
  const [debtTitle, setDebtTitle] = useState("");
  const [debtDescription, setDebtDescription] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtCurrency, setDebtCurrency] = useState<"VND" | "USD">("VND");
  const [debtOccurredAt, setDebtOccurredAt] = useState(dateValue());
  const [debtDueDate, setDebtDueDate] = useState("");

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState<"VND" | "USD">("VND");
  const [paymentDate, setPaymentDate] = useState(dateValue());
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const [receivableResponse, partyResponse, accountResponse] = await Promise.all([
        fetch("/api/external-receivables", { cache: "no-store" }),
        fetch("/api/external-parties", { cache: "no-store" }),
        fetch("/api/payment-accounts", { cache: "no-store" }),
      ]);
      const [receivableData, partyData, accountData] = await Promise.all([
        readResponseJsonSafe<{ error?: string; rows?: ExternalReceivableRow[] }>(receivableResponse),
        readResponseJsonSafe<{ error?: string; rows?: ExternalParty[] }>(partyResponse),
        readResponseJsonSafe<{ error?: string; rows?: PaymentAccount[] }>(accountResponse),
      ]);
      if (!receivableResponse.ok) {
        toast.error(receivableData.error ?? "Không tải được công nợ");
        return;
      }
      if (!partyResponse.ok) {
        toast.error(partyData.error ?? "Không tải được danh sách bên nợ");
        return;
      }
      if (!accountResponse.ok) {
        toast.error(accountData.error ?? "Không tải được tài khoản thanh toán");
        return;
      }
      setRows(Array.isArray(receivableData.rows) ? receivableData.rows : []);
      setParties(Array.isArray(partyData.rows) ? partyData.rows : []);
      setPaymentAccounts(Array.isArray(accountData.rows) ? accountData.rows : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const summary = useMemo(() => {
    const activeRows = rows.filter((row) => row.status !== "CANCELLED");
    return activeRows.reduce(
      (acc, row) => {
        acc.total += Number(row.amountVnd);
        acc.paid += Number(row.paidAmountVnd);
        acc.remaining += Number(row.remainingAmountVnd);
        return acc;
      },
      { total: 0, paid: 0, remaining: 0 }
    );
  }, [rows]);

  function resetPartyForm() {
    setEditingPartyId(null);
    setPartyName("");
    setPartyType("OTHER");
    setPartyContactName("");
    setPartyContactPhone("");
    setPartyNote("");
  }

  function editParty(party: ExternalParty) {
    setEditingPartyId(party.id);
    setPartyName(party.name);
    setPartyType(party.type);
    setPartyContactName(party.contactName ?? "");
    setPartyContactPhone(party.contactPhone ?? "");
    setPartyNote(party.note ?? "");
  }

  async function saveParty() {
    if (partyName.trim().length < 2) {
      toast.error("Tên bên nợ phải có ít nhất 2 ký tự");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(editingPartyId ? `/api/external-parties/${editingPartyId}` : "/api/external-parties", {
        method: editingPartyId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: partyName,
          type: partyType,
          contactName: partyContactName,
          contactPhone: partyContactPhone,
          note: partyNote,
        }),
      });
      const data = await readResponseJsonSafe<{ error?: string; row?: ExternalParty }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Lưu bên nợ thất bại");
        return;
      }
      toast.success(editingPartyId ? "Đã cập nhật bên nợ" : "Đã tạo bên nợ");
      if (data.row?.id) setDebtPartyId(data.row.id);
      resetPartyForm();
      await loadRows();
    } finally {
      setSaving(false);
    }
  }

  async function deleteParty() {
    if (!deletePartyTarget) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/external-parties/${deletePartyTarget.id}`, { method: "DELETE" });
      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Xóa bên nợ thất bại");
        return;
      }
      toast.success("Đã xóa bên nợ");
      if (editingPartyId === deletePartyTarget.id) resetPartyForm();
      setDeletePartyTarget(null);
      await loadRows();
    } finally {
      setSaving(false);
    }
  }

  async function createDebt() {
    const amount = Number(debtAmount);
    if (!debtPartyId) {
      toast.error("Vui lòng chọn bên nợ");
      return;
    }
    if (debtTitle.trim().length < 3) {
      toast.error("Tên khoản công nợ phải có ít nhất 3 ký tự");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Số tiền phải lớn hơn 0");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/external-receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: debtPartyId,
          title: debtTitle,
          description: debtDescription,
          amountOriginal: amount,
          currencyCode: debtCurrency,
          occurredAt: toIsoDate(debtOccurredAt),
          dueDate: toIsoDate(debtDueDate),
        }),
      });
      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Tạo công nợ thất bại");
        return;
      }
      toast.success("Đã tạo công nợ");
      setDebtTitle("");
      setDebtDescription("");
      setDebtAmount("");
      setDebtDueDate("");
      setCreateDebtOpen(false);
      await loadRows();
    } finally {
      setSaving(false);
    }
  }

  async function createPayment() {
    if (!paymentTarget) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Số tiền thu phải lớn hơn 0");
      return;
    }
    if (!paymentAccountId) {
      toast.error("Vui lòng chọn tài khoản nhận tiền");
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("amountOriginal", String(amount));
      formData.set("currencyCode", paymentCurrency);
      formData.set("paymentDate", toIsoDate(paymentDate) ?? new Date().toISOString());
      formData.set("paymentAccountId", paymentAccountId);
      if (paymentNote.trim()) formData.set("note", paymentNote.trim());
      if (paymentFile) formData.set("receiptFile", paymentFile);
      const response = await fetch(`/api/external-receivables/${paymentTarget.id}/payments`, {
        method: "POST",
        body: formData,
      });
      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Ghi nhận thu tiền thất bại");
        return;
      }
      toast.success("Đã ghi nhận thu tiền");
      setPaymentTarget(null);
      setPaymentAmount("");
      setPaymentNote("");
      setPaymentFile(null);
      await loadRows();
    } finally {
      setSaving(false);
    }
  }

  async function cancelDebt() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/external-receivables/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Hủy công nợ thất bại");
        return;
      }
      toast.success("Đã hủy công nợ");
      setCancelTarget(null);
      await loadRows();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Công nợ bên ngoài</h1>
          <p className="text-sm text-muted-foreground">Theo dõi các bên ngoài đang nợ công ty và lịch sử thu tiền.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void loadRows()} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Làm mới
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              resetPartyForm();
              setPartyDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" />
            Bên nợ
          </Button>
          <Button size="sm" onClick={() => setCreateDebtOpen(true)}>
            <ReceiptText className="mr-2 size-4" />
            Tạo công nợ
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tổng phải thu</CardDescription>
            <CardTitle>{money(summary.total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Đã thu</CardDescription>
            <CardTitle className="text-emerald-700">{money(summary.paid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Còn nợ</CardDescription>
            <CardTitle className="text-rose-700">{money(summary.remaining)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách công nợ</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow>
                <TableHead>Bên nợ</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead>Ngày phát sinh</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Đã thu / còn nợ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Người tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = statusUi(row.status);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top">
                      <p className="font-medium">{row.party.name}</p>
                      <p className="text-xs text-muted-foreground">{partyTypeLabel(row.party.type)}</p>
                    </TableCell>
                    <TableCell className="max-w-[260px] align-top">
                      <p className="font-medium">{row.title}</p>
                      {row.description ? <p className="text-sm text-muted-foreground">{row.description}</p> : null}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      <p>{new Date(row.occurredAt).toLocaleDateString("vi-VN")}</p>
                      {row.dueDate ? <p className="text-xs text-muted-foreground">Hạn: {new Date(row.dueDate).toLocaleDateString("vi-VN")}</p> : null}
                    </TableCell>
                    <TableCell className="align-top font-medium">
                      {money(Number(row.amountOriginal), row.currencyCode)}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      <p className="text-emerald-700">{money(Number(row.paidAmountVnd))}</p>
                      <p className="text-rose-700">{money(Number(row.remainingAmountVnd))}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      <p>{row.creator.fullName}</p>
                      <p className="text-xs text-muted-foreground">{row.creator.email}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setViewingRow(row)}>
                          <Eye className="mr-2 size-4" />
                          Chi tiết
                        </Button>
                        {row.status !== "PAID" && row.status !== "CANCELLED" ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setPaymentTarget(row);
                              setPaymentCurrency(row.currencyCode);
                              setPaymentAmount("");
                            }}
                          >
                            Ghi nhận thu
                          </Button>
                        ) : null}
                        {row.status === "OPEN" && row.payments.length === 0 ? (
                          <Button size="sm" variant="outline" onClick={() => setCancelTarget(row)}>
                            <XCircle className="mr-2 size-4" />
                            Hủy công nợ
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Chưa có công nợ bên ngoài.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={partyDialogOpen} onOpenChange={setPartyDialogOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Bên nợ</DialogTitle>
            <DialogDescription>Thêm, sửa hoặc xóa các bên ngoài đang được dùng để ghi công nợ.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
            <div className="grid gap-3 rounded-md border p-3">
              <div className="space-y-2">
                <Label>Tên bên nợ</Label>
                <Input value={partyName} onChange={(event) => setPartyName(event.target.value)} placeholder="Unicorn, DRAGON EMB..." />
              </div>
              <div className="space-y-2">
                <Label>Loại</Label>
                <Select value={partyType} onValueChange={setPartyType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-2">
                  <Label>Người liên hệ</Label>
                  <Input value={partyContactName} onChange={(event) => setPartyContactName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>SĐT/Zalo</Label>
                  <Input value={partyContactPhone} onChange={(event) => setPartyContactPhone(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea value={partyNote} onChange={(event) => setPartyNote(event.target.value)} />
              </div>
              <div className="flex justify-end gap-2">
                {editingPartyId ? (
                  <Button variant="outline" onClick={resetPartyForm}>
                    Tạo mới
                  </Button>
                ) : null}
                <Button disabled={saving} onClick={() => void saveParty()}>
                  {saving ? "Đang lưu..." : editingPartyId ? "Lưu chỉnh sửa" : "Thêm bên nợ"}
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Liên hệ</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties.map((party) => (
                    <TableRow key={party.id}>
                      <TableCell className="font-medium">{party.name}</TableCell>
                      <TableCell>{partyTypeLabel(party.type)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[party.contactName, party.contactPhone].filter(Boolean).join(" - ") || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => editParty(party)}>
                            <Pencil className="mr-2 size-4" />
                            Sửa
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeletePartyTarget(party)}>
                            <Trash2 className="mr-2 size-4" />
                            Xóa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!parties.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        Chưa có bên nợ nào.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartyDialogOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDebtOpen} onOpenChange={setCreateDebtOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tạo công nợ</DialogTitle>
            <DialogDescription>Chỉ ghi các khoản bên ngoài đang nợ công ty.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Bên nợ</Label>
              <Select value={debtPartyId} onValueChange={setDebtPartyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn bên nợ" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((party) => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nội dung</Label>
              <Input value={debtTitle} onChange={(event) => setDebtTitle(event.target.value)} placeholder="Công nợ fulfill tháng 10" />
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_140px]">
              <div className="space-y-2">
                <Label>Số tiền phải thu</Label>
                <Input type="number" min={0} value={debtAmount} onChange={(event) => setDebtAmount(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tiền tệ</Label>
                <Select value={debtCurrency} onValueChange={(value) => setDebtCurrency(value as "VND" | "USD")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VND">VND</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Ngày phát sinh</Label>
                <Input type="date" value={debtOccurredAt} onChange={(event) => setDebtOccurredAt(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hạn thu</Label>
                <Input type="date" value={debtDueDate} onChange={(event) => setDebtDueDate(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Textarea value={debtDescription} onChange={(event) => setDebtDescription(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDebtOpen(false)}>
              Hủy
            </Button>
            <Button disabled={saving} onClick={() => void createDebt()}>
              {saving ? "Đang tạo..." : "Tạo công nợ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paymentTarget)} onOpenChange={(open) => !open && setPaymentTarget(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ghi nhận thu tiền</DialogTitle>
            <DialogDescription>{paymentTarget ? `${paymentTarget.party.name} - còn nợ ${money(paymentTarget.remainingAmountVnd)}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-[1fr_140px]">
              <div className="space-y-2">
                <Label>Số tiền đã thu</Label>
                <Input type="number" min={0} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tiền tệ</Label>
                <Select value={paymentCurrency} onValueChange={(value) => setPaymentCurrency(value as "VND" | "USD")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VND">VND</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tài khoản nhận tiền</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn tài khoản" />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.accountName} - {account.bankName} - {account.accountNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Ngày thu</Label>
                <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ảnh chứng từ</Label>
                <Input type="file" accept="image/*" onChange={(event) => setPaymentFile(event.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)}>
              Hủy
            </Button>
            <Button disabled={saving} onClick={() => void createPayment()}>
              {saving ? "Đang lưu..." : "Ghi nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingRow)} onOpenChange={(open) => !open && setViewingRow(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewingRow?.title}</DialogTitle>
            <DialogDescription>{viewingRow ? `${viewingRow.party.name} - ${statusUi(viewingRow.status).label}` : ""}</DialogDescription>
          </DialogHeader>
          {viewingRow ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-md border p-3 text-sm md:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Phải thu</p>
                  <p className="font-medium">{money(Number(viewingRow.amountOriginal), viewingRow.currencyCode)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Đã thu</p>
                  <p className="font-medium text-emerald-700">{money(viewingRow.paidAmountVnd)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Còn nợ</p>
                  <p className="font-medium text-rose-700">{money(viewingRow.remainingAmountVnd)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Lịch sử thu tiền</h3>
                <div className="divide-y rounded-md border">
                  {viewingRow.payments.map((payment) => (
                    <div key={payment.id} className="grid gap-3 p-3 text-sm md:grid-cols-[1fr_auto]">
                      <div>
                        <p className="font-medium">{money(Number(payment.amountOriginal), payment.currencyCode)}</p>
                        <p className="text-muted-foreground">{new Date(payment.paymentDate).toLocaleDateString("vi-VN")}</p>
                        <p className="text-muted-foreground">
                          {payment.paymentAccount
                            ? `${payment.paymentAccount.accountName} - ${payment.paymentAccount.bankName} - ${payment.paymentAccount.accountNumber}`
                            : "Không rõ tài khoản"}
                        </p>
                        {payment.note ? <p>{payment.note}</p> : null}
                      </div>
                      {payment.receiptImagePath ? (
                        <a href={payment.receiptImagePath} target="_blank" rel="noreferrer" className="relative block h-24 w-32 overflow-hidden rounded-md border">
                          <Image src={payment.receiptImagePath} alt={payment.receiptImageName ?? "Chứng từ"} fill className="object-cover" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                  {!viewingRow.payments.length ? (
                    <p className="p-3 text-sm text-muted-foreground">Chưa có lần thu tiền nào.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy công nợ?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget ? `Bạn sắp hủy công nợ "${cancelTarget.title}". Thao tác này chỉ áp dụng khi chưa có lịch sử thu tiền.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Đóng</AlertDialogCancel>
            <AlertDialogAction disabled={saving} variant="destructive" onClick={() => void cancelDebt()}>
              Hủy công nợ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deletePartyTarget)} onOpenChange={(open) => !open && setDeletePartyTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa bên nợ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePartyTarget ? `Bên nợ "${deletePartyTarget.name}" sẽ bị ẩn khỏi danh sách tạo mới. Công nợ cũ vẫn giữ nguyên lịch sử.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Đóng</AlertDialogCancel>
            <AlertDialogAction disabled={saving} variant="destructive" onClick={() => void deleteParty()}>
              Xóa bên nợ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
