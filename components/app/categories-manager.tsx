"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryNoteHint } from "@/components/app/category-note-hint";

type Category = {
  id: string;
  name: string;
  note: string | null;
  contactEmail: string | null;
  type: "INCOME" | "EXPENSE";
  parentId: string | null;
  parentName: string | null;
  level: number;
  path: string[];
  pathLabel: string;
  accountantApprovalThresholdVnd: number | null;
  transactionCount: number;
  childCount: number;
};

type CategoryNode = {
  category: Category;
  children: CategoryNode[];
};

type DialogState = { mode: "create"; parentId: string | null } | { mode: "edit"; category: Category } | null;

const MAX_CATEGORY_LEVEL = 3;
const NO_PARENT = "__NONE__";

function buildTree(rows: Category[]): CategoryNode[] {
  const childrenByParentId = new Map<string, Category[]>();
  for (const row of rows) {
    const key = row.parentId ?? "__ROOT__";
    childrenByParentId.set(key, [...(childrenByParentId.get(key) ?? []), row]);
  }
  const build = (parentKey: string): CategoryNode[] =>
    (childrenByParentId.get(parentKey) ?? [])
      .toSorted((a, b) => a.name.localeCompare(b.name, "vi"))
      .map((category) => ({ category, children: build(category.id) }));
  return build("__ROOT__");
}

function flattenTree(nodes: CategoryNode[]): Category[] {
  return nodes.flatMap((node) => [node.category, ...flattenTree(node.children)]);
}

export function CategoriesManager() {
  const [rows, setRows] = useState<Category[]>([]);
  const [defaultApprovalThresholdVnd, setDefaultApprovalThresholdVnd] = useState(5_000_000);
  const [roles, setRoles] = useState<string[]>([]);
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formContactEmail, setFormContactEmail] = useState("");
  const [formType, setFormType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [formParentId, setFormParentId] = useState<string>(NO_PARENT);
  const [formThreshold, setFormThreshold] = useState("");

  const loadRows = useCallback(async () => {
    const response = await fetch("/api/categories", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error ?? "Không tải được danh mục");
      return;
    }
    setRows(Array.isArray(data.rows) ? (data.rows as Category[]) : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/settings/approval-threshold", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
    ]).then(async ([thresholdResponse, meResponse]) => {
      const [thresholdData, meData] = await Promise.all([
        thresholdResponse.json().catch(() => ({})),
        meResponse.json().catch(() => ({})),
      ]);
      if (cancelled) return;
      if (thresholdResponse.ok && typeof thresholdData.accountantApprovalThresholdVnd === "number") {
        setDefaultApprovalThresholdVnd(thresholdData.accountantApprovalThresholdVnd);
      }
      if (meResponse.ok) {
        setRoles(Array.isArray(meData.user?.roles) ? meData.user.roles : []);
      }
    });
    void loadRows();
    return () => {
      cancelled = true;
    };
  }, [loadRows]);

  useEffect(() => {
    const reload = () => {
      void loadRows();
    };
    window.addEventListener("category-migration-applied", reload);
    return () => {
      window.removeEventListener("category-migration-applied", reload);
    };
  }, [loadRows]);

  const tree = useMemo(() => buildTree(rows), [rows]);
  const orderedRows = useMemo(() => flattenTree(tree), [tree]);
  const canManage = roles.includes("ADMIN") || roles.includes("ACCOUNTANT");
  const editingCategory = dialogState?.mode === "edit" ? dialogState.category : null;

  // A category can never sit under itself or one of its own descendants.
  const descendantIds = useMemo(() => {
    if (!editingCategory) return new Set<string>();
    const result = new Set<string>();
    let frontier = [editingCategory.id];
    while (frontier.length) {
      const next = rows.filter((row) => row.parentId && frontier.includes(row.parentId)).map((row) => row.id);
      next.forEach((id) => result.add(id));
      frontier = next;
    }
    return result;
  }, [editingCategory, rows]);

  const parentOptions = useMemo(() => {
    // Moving a branch drags its children along, so the deepest allowed slot shrinks accordingly.
    const maxParentLevel = editingCategory && editingCategory.childCount > 0 ? 1 : MAX_CATEGORY_LEVEL - 1;
    return orderedRows.filter(
      (row) => row.id !== editingCategory?.id && !descendantIds.has(row.id) && row.level <= maxParentLevel
    );
  }, [orderedRows, editingCategory, descendantIds]);

  function openCreate(parentId: string | null) {
    const parent = parentId ? rows.find((row) => row.id === parentId) ?? null : null;
    setFormName("");
    setFormNote("");
    setFormContactEmail("");
    setFormType(parent?.type ?? "EXPENSE");
    setFormParentId(parentId ?? NO_PARENT);
    setFormThreshold(String(defaultApprovalThresholdVnd));
    setDialogState({ mode: "create", parentId });
  }

  function openEdit(category: Category) {
    setFormName(category.name);
    setFormNote(category.note ?? "");
    setFormContactEmail(category.contactEmail ?? "");
    setFormType(category.type);
    setFormParentId(category.parentId ?? NO_PARENT);
    setFormThreshold(String(category.accountantApprovalThresholdVnd ?? defaultApprovalThresholdVnd));
    setDialogState({ mode: "edit", category });
  }

  async function submitDialog() {
    if (!dialogState) return;
    const normalizedName = formName.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2) {
      toast.error("Tên danh mục phải có ít nhất 2 ký tự");
      return;
    }
    const threshold = Number(formThreshold);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      toast.error("Ngưỡng duyệt phải là số nguyên dương");
      return;
    }

    setSaving(true);
    try {
      if (dialogState.mode === "create") {
        const response = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: normalizedName,
            note: formNote.trim() || undefined,
            contactEmail: formContactEmail.trim() || undefined,
            type: formType,
            parentId: formParentId === NO_PARENT ? undefined : formParentId,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast.error(data.error ?? "Tạo danh mục thất bại");
          return;
        }
        // The create endpoint applies the default threshold, so a custom one needs a follow-up patch.
        if (data.row?.id && Math.floor(threshold) !== defaultApprovalThresholdVnd) {
          await fetch(`/api/categories/${data.row.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountantApprovalThresholdVnd: Math.floor(threshold) }),
          });
        }
        toast.success("Đã thêm danh mục");
      } else {
        const category = dialogState.category;
        const response = await fetch(`/api/categories/${category.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: normalizedName,
            note: formNote.trim() || null,
            contactEmail: formContactEmail.trim() || null,
            ...(category.transactionCount > 0 ? {} : { type: formType }),
            parentId: formParentId === NO_PARENT ? null : formParentId,
            accountantApprovalThresholdVnd: Math.floor(threshold),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast.error(data.error ?? "Cập nhật danh mục thất bại");
          return;
        }
        toast.success("Đã cập nhật danh mục");
      }
      setDialogState(null);
      await loadRows();
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Xóa danh mục "${category.name}"?`)) return;
    setDeletingId(category.id);
    try {
      const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Xóa danh mục thất bại");
        return;
      }
      toast.success("Đã xóa danh mục");
      await loadRows();
    } finally {
      setDeletingId(null);
    }
  }

  function renderNode(node: CategoryNode, depth: number) {
    const { category } = node;
    const hasChildren = node.children.length > 0;
    const collapsed = collapsedIds.includes(category.id);
    const canAddChild = category.level < MAX_CATEGORY_LEVEL;
    const canDelete = category.transactionCount === 0 && category.childCount === 0;

    return (
      <li key={category.id}>
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3 py-2 hover:bg-muted/40"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted"
              onClick={() =>
                setCollapsedIds((prev) =>
                  prev.includes(category.id) ? prev.filter((id) => id !== category.id) : [...prev, category.id]
                )
              }
              aria-label={collapsed ? `Mở ${category.name}` : `Đóng ${category.name}`}
            >
              <ChevronRight className={`size-4 transition-transform ${collapsed ? "" : "rotate-90"}`} />
            </button>
          ) : (
            <span className="inline-block size-6 shrink-0" />
          )}

          <div className="min-w-[220px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={depth === 0 ? "font-semibold" : "font-medium"}>{category.name}</span>
              <CategoryNoteHint note={category.note} />
              <Badge variant="outline" className="font-normal">
                {category.type === "EXPENSE" ? "Chi" : "Thu"}
              </Badge>
              {hasChildren ? (
                <Badge variant="secondary" className="font-normal">
                  Nhóm · {node.children.length} mục con
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-normal text-emerald-700">
                  Chọn được khi ghi sổ
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {category.contactEmail ? `${category.contactEmail} · ` : ""}Cấp {category.level}
              {category.level > 1 ? ` · ${category.pathLabel}` : ""} · {category.transactionCount} giao dịch · Ngưỡng{" "}
              {Number(category.accountantApprovalThresholdVnd ?? defaultApprovalThresholdVnd).toLocaleString("vi-VN")}
            </p>
          </div>

          {canManage ? (
            <div className="flex shrink-0 flex-wrap gap-1">
              {canAddChild ? (
                <Button size="sm" variant="outline" onClick={() => openCreate(category.id)}>
                  <Plus className="mr-1 size-3.5" />
                  Thêm con
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => openEdit(category)}>
                <Pencil className="mr-1 size-3.5" />
                Sửa
              </Button>
              {canDelete ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deletingId === category.id}
                  onClick={() => void deleteCategory(category)}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  {deletingId === category.id ? "Đang xóa..." : "Xóa"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {hasChildren && !collapsed ? <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
      </li>
    );
  }

  const dialogParentLabel =
    dialogState?.mode === "create" && dialogState.parentId
      ? rows.find((row) => row.id === dialogState.parentId)?.pathLabel ?? ""
      : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="size-5" />
              Cây danh mục
            </CardTitle>
            <CardDescription>
              Tối đa 3 cấp: danh mục gốc → danh mục → danh mục con. Khi ghi sổ chỉ chọn được mục ở tầng sâu nhất, mục có
              con trở thành nhóm.
            </CardDescription>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => openCreate(null)}>
              <Plus className="mr-1 size-4" />
              Thêm danh mục gốc
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {tree.length ? (
            <ul className="overflow-hidden rounded-md border [&>li:last-child>div]:border-b-0">
              {tree.map((node) => renderNode(node, 0))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có danh mục nào.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(dialogState)} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogState?.mode === "edit"
                ? "Sửa danh mục"
                : dialogParentLabel
                  ? "Thêm danh mục con"
                  : "Thêm danh mục gốc"}
            </DialogTitle>
            <DialogDescription>
              {dialogState?.mode === "edit"
                ? `Đang sửa: ${dialogState.category.pathLabel}`
                : dialogParentLabel
                  ? `Danh mục cha: ${dialogParentLabel}`
                  : "Danh mục gốc nằm ở cấp 1, ví dụ Feline hoặc Supplier."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="category-name">Tên danh mục</Label>
              <Input
                id="category-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Ví dụ: Chi phí đơn hàng"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-note">Ghi chú (không bắt buộc)</Label>
              <Input
                id="category-note"
                value={formNote}
                onChange={(event) => setFormNote(event.target.value)}
                placeholder="Ví dụ: Phôi, đạo cụ..."
              />
              <p className="text-xs text-muted-foreground">
                Hiện thành biểu tượng chú thích cạnh tên danh mục, giúp người ghi sổ biết mục này gồm những gì.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-contact-email">Email (dùng cho xưởng)</Label>
              <Input
                id="category-contact-email"
                type="email"
                value={formContactEmail}
                onChange={(event) => setFormContactEmail(event.target.value)}
                placeholder="email@xuong.com"
              />
              <p className="text-xs text-muted-foreground">
                Khi chọn danh mục này lúc ghi sổ hoặc tạo yêu cầu mua, email sẽ tự điền vào phiếu.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Loại</Label>
              <Select
                value={formType}
                onValueChange={(value) => setFormType(value as "INCOME" | "EXPENSE")}
                disabled={Boolean(editingCategory && editingCategory.transactionCount > 0)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Chi</SelectItem>
                  <SelectItem value="INCOME">Thu</SelectItem>
                </SelectContent>
              </Select>
              {editingCategory && editingCategory.transactionCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Danh mục đã có {editingCategory.transactionCount} giao dịch nên không đổi được loại.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Danh mục con không cần cùng loại với cha, nên một gốc có thể chứa cả Thu và Chi.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Danh mục cha</Label>
              <Select value={formParentId} onValueChange={setFormParentId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>Không có — đây là danh mục gốc (cấp 1)</SelectItem>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {" ".repeat((option.level - 1) * 4)}
                      {option.level > 1 ? "└ " : ""}
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingCategory && editingCategory.childCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Danh mục này đang có mục con nên chỉ đặt được ở cấp 1 hoặc cấp 2.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-threshold">Ngưỡng duyệt kế toán (VND)</Label>
              <Input
                id="category-threshold"
                type="number"
                min={1}
                step={1}
                value={formThreshold}
                onChange={(event) => setFormThreshold(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDialogState(null)}>
              Hủy
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void submitDialog()}>
              {saving ? "Đang lưu..." : dialogState?.mode === "edit" ? "Lưu thay đổi" : "Thêm danh mục"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
