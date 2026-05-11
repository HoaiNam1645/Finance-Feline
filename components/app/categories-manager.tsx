"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  parentId: string | null;
  parentName: string | null;
  accountantApprovalThresholdVnd: number | null;
  transactionCount: number;
  childCount: number;
};

function categoryLabel(row: Pick<Category, "name" | "parentName">) {
  return row.parentName ? `${row.parentName} / ${row.name}` : row.name;
}

export function CategoriesManager() {
  const [rows, setRows] = useState<Category[]>([]);
  const [defaultApprovalThresholdVnd, setDefaultApprovalThresholdVnd] = useState(5_000_000);
  const [roles, setRoles] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [parentId, setParentId] = useState<string>("__NONE__");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [editParentId, setEditParentId] = useState<string>("__NONE__");
  const [editThresholdInput, setEditThresholdInput] = useState("");
  const [rowActionLoading, setRowActionLoading] = useState<{ id: string; action: "save" | "delete" } | null>(null);

  const loadRows = useCallback(async () => {
    const response = await fetch("/api/categories", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error ?? "Không tải được danh mục");
      return;
    }
    const nextRows = Array.isArray(data.rows) ? (data.rows as Category[]) : [];
    setRows(nextRows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/categories", { cache: "no-store" }),
      fetch("/api/settings/approval-threshold", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ])
      .then(async ([categoryResponse, thresholdResponse, meResponse]) => {
        const [categoryData, thresholdData, meData] = await Promise.all([
          categoryResponse.json().catch(() => ({})),
          thresholdResponse.json().catch(() => ({})),
          meResponse.json().catch(() => ({})),
        ]);
        return { categoryResponse, categoryData, thresholdResponse, thresholdData, meResponse, meData };
      })
      .then(({ categoryResponse, categoryData, thresholdResponse, thresholdData, meResponse, meData }) => {
        if (cancelled) return;
        if (!categoryResponse.ok) {
          toast.error(categoryData.error ?? "Không tải được danh mục");
          return;
        }
        const defaultThreshold =
          thresholdResponse.ok && typeof thresholdData.accountantApprovalThresholdVnd === "number"
            ? thresholdData.accountantApprovalThresholdVnd
            : 5_000_000;
        setDefaultApprovalThresholdVnd(defaultThreshold);
        const nextRows = Array.isArray(categoryData.rows) ? (categoryData.rows as Category[]) : [];
        setRows(nextRows);
        if (meResponse.ok) {
          setRoles(Array.isArray(meData.user?.roles) ? meData.user.roles : []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parentOptions = rows
    .filter((row) => row.type === type && !row.parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const editParentOptions = rows
    .filter((row) => row.type === editType && !row.parentId && row.id !== editingId)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  useEffect(() => {
    if (parentId === "__NONE__") return;
    const exists = parentOptions.some((item) => item.id === parentId);
    if (!exists) {
      setParentId("__NONE__");
    }
  }, [parentId, parentOptions]);

  useEffect(() => {
    if (editParentId === "__NONE__") return;
    const exists = editParentOptions.some((item) => item.id === editParentId);
    if (!exists) {
      setEditParentId("__NONE__");
    }
  }, [editParentId, editParentOptions]);

  async function createCategory() {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2) {
      toast.error("Tên danh mục phải có ít nhất 2 ký tự");
      return;
    }

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: normalizedName, type, parentId: parentId === "__NONE__" ? undefined : parentId }),
    });

    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error ?? "Tạo danh mục thất bại");
      return;
    }

    toast.success("Tạo danh mục thành công");
    setName("");
    setParentId("__NONE__");
    await loadRows();
  }

  function startEdit(row: Category) {
    const canEditThresholdOnly = row.transactionCount > 0 && roles.includes("ADMIN");
    if (row.transactionCount > 0 && !canEditThresholdOnly) return;
    setEditingId(row.id);
    setEditName(row.name);
    setEditType(row.type);
    setEditParentId(row.parentId ?? "__NONE__");
    setEditThresholdInput(String(row.accountantApprovalThresholdVnd ?? defaultApprovalThresholdVnd));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditType("EXPENSE");
    setEditParentId("__NONE__");
    setEditThresholdInput("");
  }

  async function saveCategory(row: Category) {
    const normalizedName = editName.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2) {
      toast.error("Tên danh mục phải có ít nhất 2 ký tự");
      return;
    }

    const parsed = Number(editThresholdInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Ngưỡng duyệt phải là số nguyên dương");
      return;
    }
    const nextThreshold = Math.floor(parsed);

    setRowActionLoading({ id: row.id, action: "save" });
    try {
      const payload =
        row.transactionCount > 0
          ? {
              accountantApprovalThresholdVnd: nextThreshold,
            }
          : {
              name: normalizedName,
              type: editType,
              parentId: editParentId === "__NONE__" ? null : editParentId,
              accountantApprovalThresholdVnd: nextThreshold,
            };

      const response = await fetch(`/api/categories/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Cập nhật danh mục thất bại");
        return;
      }

      toast.success("Cập nhật danh mục thành công");
      cancelEdit();
      await loadRows();
    } finally {
      setRowActionLoading(null);
    }
  }

  async function deleteCategory(row: Category) {
    if (row.transactionCount > 0) return;
    const confirmed = window.confirm(`Xóa danh mục "${row.name}"?`);
    if (!confirmed) return;

    setRowActionLoading({ id: row.id, action: "delete" });
    try {
      const response = await fetch(`/api/categories/${row.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Xóa danh mục thất bại");
        return;
      }

      toast.success("Xóa danh mục thành công");
      if (editingId === row.id) {
        cancelEdit();
      }
      await loadRows();
    } finally {
      setRowActionLoading(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Thêm danh mục</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Danh mục đã có giao dịch sẽ khóa sửa tên/loại và khóa xóa để bảo toàn lịch sử. ADMIN vẫn có thể cập nhật ngưỡng duyệt kế toán.
          </p>
          <div className="space-y-2">
            <Label>Tên danh mục</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Chi phí đơn hàng" />
          </div>
          <div className="space-y-2">
            <Label>Loại</Label>
            <Select value={type} onValueChange={(value) => setType(value as "INCOME" | "EXPENSE")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">Chi</SelectItem>
                <SelectItem value="INCOME">Thu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Danh mục cha (không bắt buộc)</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__NONE__">Không có danh mục cha</SelectItem>
                {parentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={createCategory}>Thêm danh mục</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách danh mục</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Danh mục cha</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Số giao dịch</TableHead>
                <TableHead>Số danh mục con</TableHead>
                <TableHead>Ngưỡng duyệt kế toán (VND)</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {editingId === row.id ? (
                      row.transactionCount > 0 ? (
                        <p className="text-sm text-muted-foreground">{row.name}</p>
                      ) : (
                        <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                      )
                    ) : (
                      categoryLabel(row)
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.id ? (
                      row.transactionCount > 0 ? (
                        <p className="text-sm text-muted-foreground">{row.parentName ?? "-"}</p>
                      ) : (
                        <Select value={editParentId} onValueChange={setEditParentId}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__NONE__">Không có danh mục cha</SelectItem>
                            {editParentOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    ) : (
                      row.parentName ?? "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === row.id ? (
                      row.transactionCount > 0 ? (
                        <Badge variant="outline">{row.type === "EXPENSE" ? "Chi" : "Thu"}</Badge>
                      ) : (
                        <Select value={editType} onValueChange={(value) => setEditType(value as "INCOME" | "EXPENSE")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EXPENSE">Chi</SelectItem>
                            <SelectItem value="INCOME">Thu</SelectItem>
                          </SelectContent>
                        </Select>
                      )
                    ) : (
                      <Badge variant="outline">{row.type === "EXPENSE" ? "Chi" : "Thu"}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{row.transactionCount}</TableCell>
                  <TableCell>{row.childCount}</TableCell>
                  <TableCell>
                    {editingId === row.id ? (
                      <Input
                        className="max-w-44"
                        type="number"
                        min={1}
                        step={1}
                        value={editThresholdInput}
                        onChange={(event) => setEditThresholdInput(event.target.value)}
                      />
                    ) : (
                      <p className="max-w-44">
                        {Number(row.accountantApprovalThresholdVnd ?? defaultApprovalThresholdVnd).toLocaleString("vi-VN")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {editingId === row.id ? (
                        <>
                          <Button
                            size="sm"
                            disabled={Boolean(rowActionLoading)}
                            onClick={() => void saveCategory(row)}
                          >
                            {rowActionLoading?.id === row.id && rowActionLoading.action === "save" ? "Đang lưu..." : "Lưu"}
                          </Button>
                          <Button size="sm" variant="outline" disabled={Boolean(rowActionLoading)} onClick={cancelEdit}>
                            Hủy
                          </Button>
                        </>
                      ) : row.transactionCount === 0 && row.childCount === 0 ? (
                        <>
                          <Button size="sm" variant="outline" disabled={Boolean(rowActionLoading)} onClick={() => startEdit(row)}>
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={Boolean(rowActionLoading)}
                            onClick={() => void deleteCategory(row)}
                          >
                            {rowActionLoading?.id === row.id && rowActionLoading.action === "delete" ? "Đang xóa..." : "Xóa"}
                          </Button>
                        </>
                      ) : roles.includes("ADMIN") ? (
                        <Button size="sm" variant="outline" disabled={Boolean(rowActionLoading)} onClick={() => startEdit(row)}>
                          Sửa ngưỡng
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Đã có giao dịch</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Chưa có danh mục nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
