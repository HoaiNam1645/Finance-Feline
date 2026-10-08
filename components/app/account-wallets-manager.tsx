"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, RefreshCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WalletEntry = {
  id: string;
  kind: "DEBIT" | "CREDIT";
  title: string;
  amountVnd: number;
  occurredAt: string;
  status: string;
  counterpartName: string | null;
};

type Wallet = {
  userId: string;
  fullName: string;
  email: string;
  debitVnd: number;
  creditVnd: number;
  balanceVnd: number;
  entries: WalletEntry[];
};

const moneyFormatter = new Intl.NumberFormat("vi-VN");

function money(value: number) {
  return `${moneyFormatter.format(Math.round(value))} VND`;
}

function statusLabel(status: string) {
  if (status === "PENDING_APPROVAL") return "Chờ duyệt";
  if (status === "APPROVED") return "Đã duyệt";
  if (status === "PAID") return "Đã chi";
  if (status === "REJECTED") return "Từ chối";
  return status;
}

export function AccountWalletsManager() {
  const [rows, setRows] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const searchParams = useSearchParams();
  const focusedUserId = searchParams.get("user");

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/account-wallets", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Không tải được ví Account");
        return;
      }
      setRows(Array.isArray(data.rows) ? (data.rows as Wallet[]) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  // Opened from the user list: show that person's wallet already unfolded.
  useEffect(() => {
    if (!focusedUserId) return;
    setExpandedIds((prev) => (prev.includes(focusedUserId) ? prev : [...prev, focusedUserId]));
  }, [focusedUserId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Wallet className="size-6" />
            Ví Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Số dư âm là phần Account đang gánh hộ, chưa được thu lại. Ví trừ theo số tiền thực chuyển và cộng lại khi
            yêu cầu thu được duyệt.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadRows()} disabled={loading}>
          <RefreshCcw className="mr-2 size-4" />
          Làm mới
        </Button>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map((wallet) => {
            const expanded = expandedIds.includes(wallet.userId);
            const focused = wallet.userId === focusedUserId;
            return (
              <Card key={wallet.userId} className={focused ? "ring-2 ring-primary" : undefined}>
                <CardHeader className="gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{wallet.fullName}</CardTitle>
                      <CardDescription>{wallet.email}</CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Số dư ví</p>
                      <p
                        className={`text-xl font-semibold tabular-nums ${
                          wallet.balanceVnd < 0 ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {wallet.balanceVnd > 0 ? "+" : ""}
                        {money(wallet.balanceVnd)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Đã mua vào</p>
                      <p className="font-medium tabular-nums">{money(wallet.debitVnd)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Đã thu lại</p>
                      <p className="font-medium tabular-nums">{money(wallet.creditVnd)}</p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setExpandedIds((prev) =>
                        prev.includes(wallet.userId)
                          ? prev.filter((id) => id !== wallet.userId)
                          : [...prev, wallet.userId]
                      )
                    }
                  >
                    <ChevronRight className={`mr-1 size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                    Lịch sử ví ({wallet.entries.length})
                  </Button>

                  {expanded ? (
                    wallet.entries.length ? (
                      <ul className="divide-y rounded-md border">
                        {wallet.entries.map((entry) => (
                          <li key={`${entry.kind}-${entry.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2">
                            <div className="min-w-[180px] flex-1">
                              <p className="text-sm font-medium">{entry.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(entry.occurredAt).toLocaleString("vi-VN")}
                                {entry.counterpartName ? ` · ${entry.counterpartName}` : ""}
                              </p>
                            </div>
                            <Badge variant="outline" className="font-normal">
                              {statusLabel(entry.status)}
                            </Badge>
                            <p
                              className={`shrink-0 text-sm font-semibold tabular-nums ${
                                entry.kind === "CREDIT" ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {entry.kind === "CREDIT" ? "+" : "−"}
                              {money(entry.amountVnd)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ví chưa có phát sinh nào.</p>
                    )
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {loading ? "Đang tải..." : "Chưa có người dùng nào mang role Account."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
