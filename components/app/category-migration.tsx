"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OldCategory = {
  id: string;
  name: string;
  transactionCount: number;
  requestCount: number;
  amountVnd: number;
  samples: Array<{
    id: string;
    description: string;
    amountVnd: number;
  }>;
};

type NewCategory = {
  id: string;
  name: string;
};

type MigrationResponse = {
  completed: boolean;
  oldCategories: OldCategory[];
  newCategories: NewCategory[];
};

function money(value: number) {
  return Math.round(value).toLocaleString("vi-VN");
}

export function CategoryMigration() {
  const [data, setData] = useState<MigrationResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/categories/migration", { cache: "no-store" });
      const nextData = (await response.json().catch(() => ({}))) as Partial<MigrationResponse> & { error?: string };
      if (!response.ok) {
        toast.error(nextData.error ?? "Không tải được dữ liệu mapping");
        return;
      }
      setData({
        completed: Boolean(nextData.completed),
        oldCategories: Array.isArray(nextData.oldCategories) ? nextData.oldCategories : [],
        newCategories: Array.isArray(nextData.newCategories) ? nextData.newCategories : [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isReadyToApply =
    data != null && data.oldCategories.length > 0 && data.oldCategories.every((category) => Boolean(mapping[category.id]));

  const groupedPreview = useMemo(() => {
    if (!data) return [];
    return data.newCategories.map((newCategory) => {
      const oldRows = data.oldCategories.filter((oldCategory) => mapping[oldCategory.id] === newCategory.id);
      return {
        ...newCategory,
        oldCount: oldRows.length,
        transactionCount: oldRows.reduce((sum, row) => sum + row.transactionCount, 0),
        amountVnd: oldRows.reduce((sum, row) => sum + row.amountVnd, 0),
      };
    });
  }, [data, mapping]);

  async function applyMapping() {
    if (!data || !isReadyToApply) return;

    const confirmed = window.confirm(
      "Xác nhận áp dụng mapping? Toàn bộ giao dịch/yêu cầu chi phí cũ sẽ chuyển sang 7 danh mục mới và danh mục cũ sẽ bị ẩn.",
    );
    if (!confirmed) return;

    setApplying(true);
    try {
      const response = await fetch("/api/categories/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: data.oldCategories.map((category) => ({
            oldCategoryId: category.id,
            newCategoryId: mapping[category.id],
          })),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(result.error ?? "Áp dụng mapping thất bại");
        return;
      }

      toast.success("Đã áp dụng mapping danh mục");
      setMapping({});
      await load();
      window.dispatchEvent(new Event("category-migration-applied"));
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Map danh mục chi phí</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Đang tải dữ liệu...</CardContent>
      </Card>
    );
  }

  if (!data || data.completed || data.oldCategories.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Map danh mục chi phí</CardTitle>
        <Badge variant="outline">
          {data.oldCategories.length} danh mục cũ {"->"} {data.newCategories.length} danh mục mới
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Danh mục cũ</TableHead>
              <TableHead className="text-right">Giao dịch</TableHead>
              <TableHead className="text-right">Tổng VND</TableHead>
              <TableHead>Giao dịch mẫu</TableHead>
              <TableHead>Map sang danh mục mới</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.oldCategories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell className="text-right">{category.transactionCount}</TableCell>
                <TableCell className="text-right">{money(category.amountVnd)}</TableCell>
                <TableCell className="max-w-72 text-xs text-muted-foreground">
                  {category.samples.slice(0, 2).map((sample) => sample.description).join(", ")}
                </TableCell>
                <TableCell>
                  <Select
                    value={mapping[category.id] ?? ""}
                    onValueChange={(value) => setMapping((current) => ({ ...current, [category.id]: value }))}
                  >
                    <SelectTrigger className="min-w-64">
                      <SelectValue placeholder="Chọn danh mục mới" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.newCategories.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {groupedPreview.map((row) => (
            <div key={row.id} className="rounded-md border p-3">
              <p className="text-sm font-medium">{row.name}</p>
              <p className="text-xs text-muted-foreground">
                {row.oldCount} mục cũ, {row.transactionCount} giao dịch, {money(row.amountVnd)} VND
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            Đã map {Object.values(mapping).filter(Boolean).length}/{data.oldCategories.length}
          </span>
          <Button disabled={!isReadyToApply || applying} onClick={() => void applyMapping()}>
            {applying ? "Đang xác nhận..." : "Xác nhận áp dụng mapping"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
