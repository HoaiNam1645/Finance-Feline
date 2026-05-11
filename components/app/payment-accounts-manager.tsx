"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PaymentAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
  isActive: boolean;
  createdAt: string;
};

type PaymentAccountsResponse = {
  error?: string;
  rows?: PaymentAccount[];
};

export function PaymentAccountsManager() {
  const [rows, setRows] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editOwnerName, setEditOwnerName] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/payment-accounts?includeInactive=true", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as PaymentAccountsResponse;
      if (!response.ok) {
        toast.error(data.error ?? "Không tải được tài khoản thanh toán");
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  function resetCreateForm() {
    setAccountName("");
    setBankName("");
    setAccountNumber("");
    setOwnerName("");
    setIsActive(true);
  }

  function startEdit(row: PaymentAccount) {
    setEditingId(row.id);
    setEditAccountName(row.accountName);
    setEditBankName(row.bankName);
    setEditAccountNumber(row.accountNumber);
    setEditOwnerName(row.ownerName);
    setEditIsActive(row.isActive);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditAccountName("");
    setEditBankName("");
    setEditAccountNumber("");
    setEditOwnerName("");
    setEditIsActive(true);
  }

  async function createAccount() {
    if (accountName.trim().length < 2 || bankName.trim().length < 2 || accountNumber.trim().length < 3 || ownerName.trim().length < 2) {
      toast.error("Vui lòng nhập đầy đủ thông tin tài khoản thanh toán");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/payment-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: accountName.trim(),
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          ownerName: ownerName.trim(),
          isActive,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Thêm tài khoản thanh toán thất bại");
        return;
      }
      toast.success("Đã thêm tài khoản thanh toán");
      resetCreateForm();
      await loadRows();
    } finally {
      setCreating(false);
    }
  }

  async function saveAccount(id: string) {
    if (
      editAccountName.trim().length < 2 ||
      editBankName.trim().length < 2 ||
      editAccountNumber.trim().length < 3 ||
      editOwnerName.trim().length < 2
    ) {
      toast.error("Vui lòng nhập đầy đủ thông tin tài khoản thanh toán");
      return;
    }

    setSavingId(id);
    try {
      const response = await fetch(`/api/payment-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: editAccountName.trim(),
          bankName: editBankName.trim(),
          accountNumber: editAccountNumber.trim(),
          ownerName: editOwnerName.trim(),
          isActive: editIsActive,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Cập nhật tài khoản thanh toán thất bại");
        return;
      }
      toast.success("Đã cập nhật tài khoản thanh toán");
      cancelEdit();
      await loadRows();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Thêm tài khoản thanh toán</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Tên tài khoản</Label>
            <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Tài khoản công ty chính" />
          </div>
          <div className="space-y-2">
            <Label>Ngân hàng</Label>
            <Input value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Vietcombank" />
          </div>
          <div className="space-y-2">
            <Label>Số tài khoản</Label>
            <Input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="0123456789" />
          </div>
          <div className="space-y-2">
            <Label>Chủ tài khoản</Label>
            <Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="CONG TY ABC" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <p className="text-sm font-medium">Hoạt động</p>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <Button className="w-full" disabled={creating} onClick={() => void createAccount()}>
            {creating ? "Đang thêm..." : "Thêm tài khoản"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách tài khoản thanh toán</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên tài khoản</TableHead>
                <TableHead>Ngân hàng</TableHead>
                <TableHead>Số tài khoản</TableHead>
                <TableHead>Chủ tài khoản</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Tạo lúc</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {editingId === row.id ? (
                      <Input value={editAccountName} onChange={(event) => setEditAccountName(event.target.value)} />
                    ) : (
                      row.accountName
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.id ? (
                      <Input value={editBankName} onChange={(event) => setEditBankName(event.target.value)} />
                    ) : (
                      row.bankName
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.id ? (
                      <Input value={editAccountNumber} onChange={(event) => setEditAccountNumber(event.target.value)} />
                    ) : (
                      row.accountNumber
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.id ? (
                      <Input value={editOwnerName} onChange={(event) => setEditOwnerName(event.target.value)} />
                    ) : (
                      row.ownerName
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.id ? (
                      <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
                    ) : (
                      <Badge variant={row.isActive ? "default" : "secondary"}>
                        {row.isActive ? "Hoạt động" : "Ngừng dùng"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleString("vi-VN")}</TableCell>
                  <TableCell className="text-right">
                    {editingId === row.id ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" disabled={savingId === row.id} onClick={() => void saveAccount(row.id)}>
                          {savingId === row.id ? "Đang lưu..." : "Lưu"}
                        </Button>
                        <Button size="sm" variant="outline" disabled={savingId === row.id} onClick={cancelEdit}>
                          Hủy
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                        Sửa
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Chưa có tài khoản thanh toán nào.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
