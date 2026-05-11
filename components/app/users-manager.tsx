"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE";
  roles: string[];
  createdAt: string;
  hasActivity: boolean;
};

type RoleOption = {
  id: string;
  code: string;
  name: string;
};

type UsersResponse = {
  error?: string;
  rows?: UserRow[];
  roleOptions?: RoleOption[];
};

function mapRoleLabel(role: string) {
  if (role === "ADMIN") return "Quản trị";
  if (role === "ACCOUNTANT") return "Kế toán";
  if (role === "EMPLOYEE") return "Nhân viên";
  return role;
}

export function UsersManager() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);

  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>(["EMPLOYEE"]);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editBanned, setEditBanned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const hasAdminOption = useMemo(() => roleOptions.some((role) => role.code === "ADMIN"), [roleOptions]);

  const loadRows = useCallback(async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as UsersResponse;
    if (!response.ok) {
      toast.error(data.error ?? "Không tải được danh sách user");
      return;
    }
    setRows(Array.isArray(data.rows) ? data.rows : []);
    setRoleOptions(Array.isArray(data.roleOptions) ? data.roleOptions : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/users", { cache: "no-store" })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (cancelled) return;
        const payload = data as UsersResponse;
        if (!response.ok) {
          toast.error(payload.error ?? "Không tải được danh sách user");
          return;
        }
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setRoleOptions(Array.isArray(payload.roleOptions) ? payload.roleOptions : []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleRole(current: string[], role: string) {
    if (current.includes(role)) {
      return current.filter((item) => item !== role);
    }
    return [...current, role];
  }

  function ensureAtLeastOneRole(roles: string[]) {
    if (roles.length > 0) return roles;
    return ["EMPLOYEE"];
  }

  async function createUser() {
    if (createName.trim().length < 2) {
      toast.error("Tên user phải có ít nhất 2 ký tự");
      return;
    }
    if (!createEmail.includes("@")) {
      toast.error("Email không hợp lệ");
      return;
    }
    if (createPassword.length < 8) {
      toast.error("Mật khẩu phải có ít nhất 8 ký tự");
      return;
    }

    setCreating(true);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: createName.trim(),
        email: createEmail.trim().toLowerCase(),
        password: createPassword,
        roles: ensureAtLeastOneRole(createRoles),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast.error(data.error ?? "Tạo user thất bại");
      setCreating(false);
      return;
    }

    toast.success("Tạo user thành công");
    setCreating(false);
    setCreateName("");
    setCreateEmail("");
    setCreatePassword("");
    setCreateRoles(["EMPLOYEE"]);
    await loadRows();
  }

  function openEditModal(row: UserRow) {
    setEditing(row);
    setEditName(row.fullName);
    setEditEmail(row.email);
    setEditPassword("");
    setEditRoles(row.roles);
    setEditBanned(row.status === "INACTIVE");
  }

  async function saveUser() {
    if (!editing) return;
    if (editName.trim().length < 2) {
      toast.error("Tên user phải có ít nhất 2 ký tự");
      return;
    }
    if (!editEmail.includes("@")) {
      toast.error("Email không hợp lệ");
      return;
    }
    if (editPassword && editPassword.length < 8) {
      toast.error("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }
    if (!editRoles.length) {
      toast.error("Phải chọn ít nhất một quyền");
      return;
    }

    setSaving(true);
    const response = await fetch(`/api/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        ...(editPassword ? { password: editPassword } : {}),
        roles: editRoles,
        status: editBanned ? "INACTIVE" : "ACTIVE",
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast.error(data.error ?? "Cập nhật user thất bại");
      setSaving(false);
      return;
    }

    toast.success("Đã cập nhật user");
    setSaving(false);
    setEditing(null);
    await loadRows();
  }

  async function deleteUser(row: UserRow) {
    if (row.hasActivity) {
      toast.error("User đã có hoạt động nên không thể xóa");
      return;
    }
    if (!confirm(`Xóa user "${row.fullName}"?`)) return;

    setDeletingUserId(row.id);
    try {
      const response = await fetch(`/api/users/${row.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Xóa user thất bại");
        return;
      }
      toast.success("Đã xóa user");
      if (editing?.id === row.id) {
        setEditing(null);
      }
      await loadRows();
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Tạo user mới</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Họ tên</Label>
            <Input value={createName} onChange={(event) => setCreateName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Mật khẩu</Label>
            <Input
              type="password"
              value={createPassword}
              onChange={(event) => setCreatePassword(event.target.value)}
              placeholder="Tối thiểu 8 ký tự"
            />
          </div>
          <div className="space-y-2">
            <Label>Quyền</Label>
            <div className="space-y-2 rounded-md border p-3">
              {roleOptions.map((role) => (
                <label key={role.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={createRoles.includes(role.code)}
                    onCheckedChange={() => setCreateRoles((prev) => ensureAtLeastOneRole(toggleRole(prev, role.code)))}
                  />
                  <span>{mapRoleLabel(role.code)}</span>
                </label>
              ))}
              {!hasAdminOption && <p className="text-xs text-muted-foreground">Chưa có danh sách quyền.</p>}
            </div>
          </div>
          <Button className="w-full" disabled={creating} onClick={createUser}>
            {creating ? "Đang tạo..." : "Tạo user"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách user</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài khoản</TableHead>
                <TableHead>Quyền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Tạo lúc</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.fullName}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                    <p className="text-xs text-muted-foreground">{row.id}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.roles.map((role) => (
                        <Badge key={`${row.id}-${role}`} variant="outline">
                          {mapRoleLabel(role)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>
                      {row.status === "ACTIVE" ? "Đang hoạt động" : "Bị ban"}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.hasActivity ? "Đã có hoạt động" : "Chưa có hoạt động"}
                    </p>
                  </TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleString("vi-VN")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(row)}>
                        Sửa
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={row.hasActivity || deletingUserId === row.id}
                        onClick={() => void deleteUser(row)}
                      >
                        {deletingUserId === row.id ? "Đang xóa..." : "Xóa"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Chưa có user nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa user</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Họ tên</Label>
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mật khẩu mới (để trống nếu không đổi)</Label>
                <Input
                  type="password"
                  value={editPassword}
                  onChange={(event) => setEditPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Quyền</Label>
                <div className="space-y-2 rounded-md border p-3">
                  {roleOptions.map((role) => (
                    <label key={role.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={editRoles.includes(role.code)}
                        onCheckedChange={() => setEditRoles((prev) => ensureAtLeastOneRole(toggleRole(prev, role.code)))}
                      />
                      <span>{mapRoleLabel(role.code)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Ban user</p>
                  <p className="text-xs text-muted-foreground">Bật để chuyển trạng thái user sang INACTIVE</p>
                </div>
                <Switch checked={editBanned} onCheckedChange={setEditBanned} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Hủy
            </Button>
            <Button disabled={saving} onClick={saveUser}>
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
