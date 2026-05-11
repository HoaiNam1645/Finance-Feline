"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ThresholdResponse = {
  accountantApprovalThresholdVnd?: number;
  defaultAccountantApprovalThresholdVnd?: number;
  error?: string;
};

export function ApprovalThresholdSettings() {
  const [value, setValue] = useState("5000000");
  const [defaultValue, setDefaultValue] = useState(5_000_000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/approval-threshold", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as ThresholdResponse;
        if (cancelled) return;
        if (!response.ok) {
          toast.error(data.error ?? "Không tải được cấu hình");
          return;
        }
        const current =
          typeof data.accountantApprovalThresholdVnd === "number" ? data.accountantApprovalThresholdVnd : 5_000_000;
        const fallback =
          typeof data.defaultAccountantApprovalThresholdVnd === "number"
            ? data.defaultAccountantApprovalThresholdVnd
            : 5_000_000;
        setValue(String(current));
        setDefaultValue(fallback);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      toast.error("Ngưỡng duyệt phải là số dương");
      return;
    }
    setSaving(true);
    const response = await fetch("/api/settings/approval-threshold", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountantApprovalThresholdVnd: Math.floor(numeric) }),
    });
    const data = (await response.json().catch(() => ({}))) as ThresholdResponse;
    if (!response.ok) {
      toast.error(data.error ?? "Lưu cấu hình thất bại");
      setSaving(false);
      return;
    }
    toast.success("Đã lưu ngưỡng duyệt cho kế toán");
    setValue(String(data.accountantApprovalThresholdVnd ?? Math.floor(numeric)));
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cấu hình ngưỡng duyệt của kế toán</CardTitle>
        <CardDescription>
          Nếu yêu cầu mua có giá trị quy đổi VND nhỏ hơn hoặc bằng ngưỡng này thì kế toán có thể duyệt.
          Mặc định: {defaultValue.toLocaleString("vi-VN")} VND.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Ngưỡng duyệt (VND)</Label>
          <Input
            type="number"
            min={1}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={loading || saving}
          />
        </div>
        <Button onClick={save} disabled={loading || saving}>
          {saving ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
      </CardContent>
    </Card>
  );
}
