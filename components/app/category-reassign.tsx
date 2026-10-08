"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  parentId: string | null;
  level: number;
  pathLabel: string;
  transactionCount: number;
  childCount: number;
};

type Scope = "ALL" | "TRANSACTIONS" | "REQUESTS";

const SCOPE_LABELS: Record<Scope, string> = {
  ALL: "Giao dịch và yêu cầu mua",
  TRANSACTIONS: "Chỉ giao dịch",
  REQUESTS: "Chỉ yêu cầu mua",
};

export function CategoryReassign() {
  const [rows, setRows] = useState<Category[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [scope, setScope] = useState<Scope>("ALL");
  const [running, setRunning] = useState(false);

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
    void loadRows();
    const reload = () => {
      void loadRows();
    };
    window.addEventListener("category-migration-applied", reload);
    return () => {
      window.removeEventListener("category-migration-applied", reload);
    };
  }, [loadRows]);

  const sourceOptions = useMemo(
    () => rows.toSorted((a, b) => a.pathLabel.localeCompare(b.pathLabel, "vi")),
    [rows]
  );
  const source = useMemo(() => rows.find((row) => row.id === fromId) ?? null, [rows, fromId]);
  // The target has to be a leaf of the same Thu/Chi type, mirroring what the API accepts.
  const targetOptions = useMemo(
    () =>
      rows
        .filter((row) => row.id !== fromId && row.childCount === 0 && (!source || row.type === source.type))
        .toSorted((a, b) => a.pathLabel.localeCompare(b.pathLabel, "vi")),
    [rows, fromId, source]
  );
  const target = useMemo(() => rows.find((row) => row.id === toId) ?? null, [rows, toId]);

  useEffect(() => {
    if (toId && !targetOptions.some((row) => row.id === toId)) setToId("");
  }, [targetOptions, toId]);

  async function runReassign() {
    if (!source || !target) {
      toast.error("Vui lòng chọn danh mục nguồn và đích");
      return;
    }
    const confirmed = window.confirm(
      `Chuyển toàn bộ ${SCOPE_LABELS[scope].toLowerCase()} từ "${source.pathLabel}" sang "${target.pathLabel}"?`
    );
    if (!confirmed) return;

    setRunning(true);
    try {
      const response = await fetch("/api/categories/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromCategoryId: source.id, toCategoryId: target.id, scope }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Chuyển danh mục thất bại");
        return;
      }
      toast.success(
        `Đã chuyển ${data.transactionCount ?? 0} giao dịch và ${data.requestCount ?? 0} yêu cầu mua sang ${target.name}`
      );
      setFromId("");
      setToId("");
      await loadRows();
      window.dispatchEvent(new Event("category-migration-applied"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shuffle className="size-5" />
          Chuyển danh mục hàng loạt
        </CardTitle>
        <CardDescription>
          Dời toàn bộ giao dịch và yêu cầu mua đang nằm ở một danh mục sang danh mục khác. Số tiền, ngày và chứng từ giữ
          nguyên, chỉ đổi danh mục. Không cần duyệt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <Label>Danh mục nguồn</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Chọn danh mục đang chứa dữ liệu" />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.pathLabel} ({option.transactionCount} GD)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source ? (
              <p className="text-xs text-muted-foreground">
                {source.type === "EXPENSE" ? "Chi" : "Thu"} · {source.transactionCount} giao dịch
              </p>
            ) : null}
          </div>

          <div className="hidden items-end pb-2 md:flex">
            <ArrowRight className="size-5 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <Label>Danh mục đích</Label>
            <Select value={toId} onValueChange={setToId} disabled={!source}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={source ? "Chọn danh mục ở tầng sâu nhất" : "Chọn danh mục nguồn trước"} />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.pathLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source && !targetOptions.length ? (
              <p className="text-xs text-muted-foreground">
                Chưa có danh mục đích hợp lệ: cần một danh mục loại {source.type === "EXPENSE" ? "Chi" : "Thu"} không có
                mục con.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 [&>div]:w-full sm:[&>div]:w-auto">
          <div className="space-y-2">
            <Label>Phạm vi</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as Scope)}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SCOPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={running || !source || !target} onClick={() => void runReassign()}>
            {running ? "Đang chuyển..." : "Chuyển danh mục"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
