"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { ArrowUpDown, CalendarIcon, ChevronRight } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DashboardTransaction = {
  id: string;
  direction: "IN" | "OUT";
  amountVnd: number;
  transactionDate: string;
  categoryName: string;
  categoryParentName: string | null;
  teamUserId: string | null;
  teamUserName: string | null;
  description: string;
};

type OverviewProps = {
  teamUsers: Array<{ id: string; name: string }>;
  transactions: DashboardTransaction[];
};

type PeriodKey = "THIS_MONTH" | "LAST_MONTH" | "1M" | "3M" | "12M" | "THIS_YEAR" | "LAST_YEAR" | "ALL";
type TeamSortKey = "income" | "expense" | "profit";
type TeamSortDirection = "asc" | "desc";
type CategorySummaryRow = {
  key: string;
  name: string;
  value: number;
  children: Array<{ key: string; name: string; value: number }>;
};

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "THIS_MONTH", label: "Tháng này" },
  { key: "LAST_MONTH", label: "Tháng trước" },
  { key: "1M", label: "1 tháng" },
  { key: "3M", label: "3 tháng" },
  { key: "12M", label: "1 năm" },
  { key: "THIS_YEAR", label: "Năm nay" },
  { key: "LAST_YEAR", label: "Năm trước" },
  { key: "ALL", label: "Tất cả" },
];

const moneyFormatter = new Intl.NumberFormat("vi-VN");

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getPeriodRange(period: PeriodKey, baseDate: Date) {
  const today = normalizeDate(baseDate);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  if (period === "THIS_MONTH") {
    return {
      from: new Date(currentYear, currentMonth, 1),
      to: today,
      granularity: "day" as const,
    };
  }
  if (period === "LAST_MONTH") {
    const from = new Date(currentYear, currentMonth - 1, 1);
    const to = new Date(currentYear, currentMonth, 0);
    return { from, to, granularity: "day" as const };
  }

  if (period === "1M") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from, to: today, granularity: "day" as const };
  }
  if (period === "3M") {
    const from = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    return { from, to: today, granularity: "month" as const };
  }
  if (period === "12M") {
    const from = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    return { from, to: today, granularity: "month" as const };
  }
  if (period === "THIS_YEAR") {
    return {
      from: new Date(currentYear, 0, 1),
      to: today,
      granularity: "month" as const,
    };
  }
  if (period === "ALL") {
    return {
      from: new Date(2000, 0, 1),
      to: today,
      granularity: "month" as const,
    };
  }
  return {
    from: new Date(currentYear - 1, 0, 1),
    to: new Date(currentYear - 1, 11, 31),
    granularity: "month" as const,
  };
}

function getBucketKey(date: Date, granularity: "day" | "month") {
  if (granularity === "day") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getBucketLabel(date: Date, granularity: "day" | "month") {
  if (granularity === "day") {
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function inRange(date: Date, from: Date, to: Date) {
  const value = normalizeDate(date).getTime();
  return value >= from.getTime() && value <= to.getTime();
}

export function DashboardOverview({ transactions, teamUsers }: OverviewProps) {
  const [period, setPeriod] = useState<PeriodKey>("THIS_YEAR");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [teamUserFilter, setTeamUserFilter] = useState("__ALL__");
  const [teamSortKey, setTeamSortKey] = useState<TeamSortKey>("profit");
  const [teamSortDirection, setTeamSortDirection] = useState<TeamSortDirection>("desc");
  const [expandedIncome, setExpandedIncome] = useState<string[]>([]);
  const [expandedExpense, setExpandedExpense] = useState<string[]>([]);
  const now = useMemo(() => new Date(), []);
  const teamOptions = useMemo(
    () => teamUsers.toSorted((a, b) => a.name.localeCompare(b.name, "vi")),
    [teamUsers]
  );

  const { range, chartData, incomeTotal, expenseTotal, expenseRatio, incomeByCategory, expenseByCategory, teamSummary } =
    useMemo(() => {
      let range = getPeriodRange(period, now);
      if (customDateRange?.from) {
        const from = normalizeDate(customDateRange.from);
        const to = normalizeDate(customDateRange.to ?? customDateRange.from);
        const safeFrom = from.getTime() <= to.getTime() ? from : to;
        const safeTo = from.getTime() <= to.getTime() ? to : from;
        const dayDiff = Math.floor((safeTo.getTime() - safeFrom.getTime()) / 86_400_000);
        range = {
          from: safeFrom,
          to: safeTo,
          granularity: dayDiff <= 45 ? "day" : "month",
        };
      }
      const from = range.from;
      const to = range.to;
      const filteredTransactions = transactions.filter((transaction) =>
        inRange(new Date(transaction.transactionDate), from, to) &&
        (teamUserFilter === "__ALL__" ? true : transaction.teamUserId === teamUserFilter)
      );

      const buckets = new Map<string, { label: string; income: number; expense: number; order: number }>();

      if (range.granularity === "day") {
        const cursor = new Date(from);
        while (cursor <= to) {
          const key = getBucketKey(cursor, "day");
          buckets.set(key, {
            label: getBucketLabel(cursor, "day"),
            income: 0,
            expense: 0,
            order: cursor.getTime(),
          });
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
        const limit = new Date(to.getFullYear(), to.getMonth(), 1);
        while (cursor <= limit) {
          const key = getBucketKey(cursor, "month");
          buckets.set(key, {
            label: getBucketLabel(cursor, "month"),
            income: 0,
            expense: 0,
            order: cursor.getTime(),
          });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      let incomeTotal = 0;
      let expenseTotal = 0;
      const incomeMap = new Map<string, { own: number; children: Map<string, number> }>();
      const expenseMap = new Map<string, { own: number; children: Map<string, number> }>();
      const teamMap = new Map<string, { name: string; income: number; expense: number }>();

      if (teamUserFilter === "__ALL__") {
        for (const team of teamOptions) {
          teamMap.set(team.id, { name: team.name, income: 0, expense: 0 });
        }
      } else {
        const selected = teamOptions.find((item) => item.id === teamUserFilter);
        if (selected) {
          teamMap.set(selected.id, { name: selected.name, income: 0, expense: 0 });
        }
      }

      for (const transaction of filteredTransactions) {
        const date = new Date(transaction.transactionDate);
        const key = getBucketKey(date, range.granularity);
        const bucket = buckets.get(key);
        if (!bucket) continue;

        if (transaction.direction === "IN") {
          bucket.income += transaction.amountVnd;
          incomeTotal += transaction.amountVnd;
          const parentKey = transaction.categoryParentName ?? transaction.categoryName;
          const parent = incomeMap.get(parentKey) ?? { own: 0, children: new Map<string, number>() };
          if (transaction.categoryParentName) {
            parent.children.set(
              transaction.categoryName,
              (parent.children.get(transaction.categoryName) ?? 0) + transaction.amountVnd
            );
          } else {
            parent.own += transaction.amountVnd;
          }
          incomeMap.set(parentKey, parent);
          const teamKey = transaction.teamUserId ?? "__UNASSIGNED__";
          const teamName = transaction.teamUserName ?? "Giao dịch không ở trong team";
          const current = teamMap.get(teamKey) ?? { name: teamName, income: 0, expense: 0 };
          current.income += transaction.amountVnd;
          teamMap.set(teamKey, current);
        } else {
          bucket.expense += transaction.amountVnd;
          expenseTotal += transaction.amountVnd;
          const parentKey = transaction.categoryParentName ?? transaction.categoryName;
          const parent = expenseMap.get(parentKey) ?? { own: 0, children: new Map<string, number>() };
          if (transaction.categoryParentName) {
            parent.children.set(
              transaction.categoryName,
              (parent.children.get(transaction.categoryName) ?? 0) + transaction.amountVnd
            );
          } else {
            parent.own += transaction.amountVnd;
          }
          expenseMap.set(parentKey, parent);
          const teamKey = transaction.teamUserId ?? "__UNASSIGNED__";
          const teamName = transaction.teamUserName ?? "Giao dịch không ở trong team";
          const current = teamMap.get(teamKey) ?? { name: teamName, income: 0, expense: 0 };
          current.expense += transaction.amountVnd;
          teamMap.set(teamKey, current);
        }
      }

      const chartData = Array.from(buckets.values())
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          label: item.label,
          thu: Math.round(item.income),
          chi: Math.round(item.expense),
        }));

      const incomeByCategory: CategorySummaryRow[] = Array.from(incomeMap.entries())
        .map(([name, value]) => {
          const children = Array.from(value.children.entries())
            .map(([childName, childValue]) => ({ key: `${name}:${childName}`, name: childName, value: Math.round(childValue) }))
            .sort((a, b) => b.value - a.value);
          const total = value.own + children.reduce((sum, child) => sum + child.value, 0);
          return { key: name, name, value: Math.round(total), children };
        })
        .sort((a, b) => b.value - a.value);

      const expenseByCategory: CategorySummaryRow[] = Array.from(expenseMap.entries())
        .map(([name, value]) => {
          const children = Array.from(value.children.entries())
            .map(([childName, childValue]) => ({ key: `${name}:${childName}`, name: childName, value: Math.round(childValue) }))
            .sort((a, b) => b.value - a.value);
          const total = value.own + children.reduce((sum, child) => sum + child.value, 0);
          return { key: name, name, value: Math.round(total), children };
        })
        .sort((a, b) => b.value - a.value);

      const teamSummary = Array.from(teamMap.values())
        .map((value) => ({
          name: value.name,
          income: Math.round(value.income),
          expense: Math.round(value.expense),
          profit: Math.round(value.income - value.expense),
        }))
        .sort((a, b) => b.profit - a.profit);

      return {
        range,
        chartData,
        incomeTotal: Math.round(incomeTotal),
        expenseTotal: Math.round(expenseTotal),
        expenseRatio: incomeTotal > 0 ? Math.min((expenseTotal / incomeTotal) * 100, 999) : 0,
        incomeByCategory,
        expenseByCategory,
        teamSummary,
      };
    }, [period, transactions, now, customDateRange, teamUserFilter, teamOptions]);

  const chartConfig = {
    thu: { label: "Thu", color: "var(--chart-2)" },
    chi: { label: "Chi", color: "var(--chart-5)" },
    loiNhuan: { label: "Lợi nhuận", color: "var(--chart-1)" },
  };
  const profitChartData = useMemo(
    () =>
      chartData.map((item) => ({
        label: item.label,
        loiNhuan: item.thu - item.chi,
      })),
    [chartData]
  );

  const sortedTeamSummary = useMemo(() => {
    const direction = teamSortDirection === "asc" ? 1 : -1;
    return teamSummary.toSorted((a, b) => {
      const diff = (a[teamSortKey] - b[teamSortKey]) * direction;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "vi");
    });
  }, [teamSummary, teamSortDirection, teamSortKey]);

  function toggleTeamSort(nextKey: TeamSortKey) {
    if (teamSortKey === nextKey) {
      setTeamSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setTeamSortKey(nextKey);
    setTeamSortDirection("desc");
  }

  function toggleIncomeCategory(key: string) {
    setExpandedIncome((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  function toggleExpenseCategory(key: string) {
    setExpandedExpense((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Dashboard tài chính</h2>
        <p className="text-sm text-muted-foreground">Theo dõi thu chi và dòng tiền theo từng kỳ.</p>
      </div>

      <Card className="pt-0 border-0 shadow-none">
        <CardContent className="space-y-3 p-0">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Kỳ báo cáo</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="overflow-x-auto overflow-y-hidden">
                <Tabs value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
                  <TabsList className="h-9 w-max">
                    {PERIODS.map((item) => (
                      <TabsTrigger key={item.key} value={item.key} className="h-8">
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="h-8 w-[220px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 size-4" />
                    {customDateRange?.from
                      ? `${customDateRange.from.toLocaleDateString("vi-VN")} - ${
                          customDateRange.to ? customDateRange.to.toLocaleDateString("vi-VN") : "..."
                        }`
                      : "Chưa chọn"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar mode="range" numberOfMonths={2} selected={customDateRange} onSelect={setCustomDateRange} />
                </PopoverContent>
              </Popover>
              <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setCustomDateRange(undefined)}>
                Xóa ngày
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Team</p>
            <div className="w-full overflow-x-auto overflow-y-hidden">
              <Tabs value={teamUserFilter} onValueChange={setTeamUserFilter}>
                <TabsList className="w-max">
                  <TabsTrigger value="__ALL__">Tất cả nhân viên</TabsTrigger>
                  {teamOptions.map((item) => (
                    <TabsTrigger key={item.id} value={item.id}>
                      {item.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-2 xl:col-span-2">
          <Card className="p-0">
            <CardHeader className="space-y-1 p-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Tổng thu</CardTitle>
              <p className="text-lg font-semibold sm:text-xl">{moneyFormatter.format(incomeTotal)} VND</p>
            </CardHeader>
          </Card>
          <Card  className="p-0">
            <CardHeader className="space-y-1 p-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Tổng chi</CardTitle>
              <p className="text-lg font-semibold sm:text-xl">{moneyFormatter.format(expenseTotal)} VND</p>
            </CardHeader>
          </Card>
          <Card  className="p-0">
            <CardHeader className="space-y-1 p-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Tỷ lệ chi/thu</CardTitle>
              <p className="text-lg font-semibold sm:text-xl">{expenseRatio.toFixed(1)}%</p>
            </CardHeader>
          </Card>
          <Card  className="p-0">
            <CardHeader className="space-y-1 p-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Lợi nhuận</CardTitle>
              <p className={`text-lg font-semibold sm:text-xl ${incomeTotal - expenseTotal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {incomeTotal - expenseTotal >= 0 ? "+" : ""}
                {moneyFormatter.format(incomeTotal - expenseTotal)} VND
              </p>
            </CardHeader>
          </Card>
        </div>

        <Card className="pt-0 border-0 shadow-none xl:col-span-3">
          <CardHeader className="px-0 pb-2">
            <CardTitle>Thu theo danh mục</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!!incomeByCategory.length && (
              <ul className="divide-y rounded-md border">
                {incomeByCategory.map((row) => (
                  <li key={row.key} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        {row.children.length > 0 ? (
                          <button
                            type="button"
                            className="inline-flex items-center rounded p-0.5 hover:bg-muted"
                            onClick={() => toggleIncomeCategory(row.key)}
                            aria-label="Mở danh mục con"
                          >
                            <ChevronRight
                              className={`size-3.5 transition-transform ${expandedIncome.includes(row.key) ? "rotate-90" : ""}`}
                            />
                          </button>
                        ) : (
                          <span className="inline-block size-4" />
                        )}
                        <p className="text-sm font-medium">{row.name}</p>
                      </div>
                      <p className="text-sm font-semibold text-emerald-700">{moneyFormatter.format(row.value)} VND</p>
                    </div>
                    {row.children.length > 0 && expandedIncome.includes(row.key) ? (
                      <ul className="mt-1 space-y-1 pl-6">
                        {row.children.map((child) => (
                          <li key={child.key} className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">{child.name}</p>
                            <p className="text-xs font-semibold text-emerald-700">{moneyFormatter.format(child.value)} VND</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!incomeByCategory.length && <p className="text-sm text-muted-foreground">Không có dữ liệu thu trong kỳ.</p>}
          </CardContent>
        </Card>

        <Card className="pt-0 border-0 shadow-none xl:col-span-3">
          <CardHeader className="px-0 pb-2">
            <CardTitle>Chi theo danh mục</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!!expenseByCategory.length && (
              <ul className="divide-y rounded-md border">
                {expenseByCategory.map((row) => (
                  <li key={row.key} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        {row.children.length > 0 ? (
                          <button
                            type="button"
                            className="inline-flex items-center rounded p-0.5 hover:bg-muted"
                            onClick={() => toggleExpenseCategory(row.key)}
                            aria-label="Mở danh mục con"
                          >
                            <ChevronRight
                              className={`size-3.5 transition-transform ${expandedExpense.includes(row.key) ? "rotate-90" : ""}`}
                            />
                          </button>
                        ) : (
                          <span className="inline-block size-4" />
                        )}
                        <p className="text-sm font-medium">{row.name}</p>
                      </div>
                      <p className="text-sm font-semibold text-rose-700">{moneyFormatter.format(row.value)} VND</p>
                    </div>
                    {row.children.length > 0 && expandedExpense.includes(row.key) ? (
                      <ul className="mt-1 space-y-1 pl-6">
                        {row.children.map((child) => (
                          <li key={child.key} className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">{child.name}</p>
                            <p className="text-xs font-semibold text-rose-700">{moneyFormatter.format(child.value)} VND</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!expenseByCategory.length && <p className="text-sm text-muted-foreground">Không có dữ liệu chi trong kỳ.</p>}
          </CardContent>
        </Card>

        {teamUserFilter === "__ALL__" ? (
          <Card className="pt-0 border-0 shadow-none xl:col-span-4">
            <CardHeader className="px-0 pb-2">
              <CardTitle>So sánh nhân viên</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="rounded-md border">
                <div className="hidden grid-cols-[1.5fr_1fr_1fr_1.8fr] gap-3 bg-muted/30 px-3 py-2 text-xs font-semibold md:grid">
                  <p>Tên nhân viên</p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-left"
                    onClick={() => toggleTeamSort("income")}
                  >
                    Thu
                    <ArrowUpDown className={`size-3.5 ${teamSortKey === "income" ? "opacity-100" : "opacity-50"}`} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-left"
                    onClick={() => toggleTeamSort("expense")}
                  >
                    Chi
                    <ArrowUpDown className={`size-3.5 ${teamSortKey === "expense" ? "opacity-100" : "opacity-50"}`} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-left"
                    onClick={() => toggleTeamSort("profit")}
                  >
                    Lợi nhuận
                    <ArrowUpDown className={`size-3.5 ${teamSortKey === "profit" ? "opacity-100" : "opacity-50"}`} />
                  </button>
                </div>
                <ul className="divide-y">
                  {sortedTeamSummary.map((row) => (
                    <li key={row.name} className="px-3 py-2">
                      <div className="space-y-2 md:hidden">
                        <p className="text-sm font-semibold">{row.name}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <p className="text-emerald-700">Thu: {moneyFormatter.format(row.income)} VND</p>
                          <p className="text-rose-700">Chi: {moneyFormatter.format(row.expense)} VND</p>
                        </div>
                        <p className={`text-xs font-semibold ${row.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          Lợi nhuận: {row.profit >= 0 ? "+" : ""}
                          {moneyFormatter.format(row.profit)} VND
                        </p>
                      </div>

                      <div className="hidden grid-cols-[1.5fr_1fr_1fr_1.8fr] gap-3 md:grid">
                        <div className="flex items-center">
                          <p className="text-sm font-semibold">{row.name}</p>
                        </div>
                        <div className="flex items-center">
                          <p className="text-xs font-medium text-emerald-700">{moneyFormatter.format(row.income)} VND</p>
                        </div>
                        <div className="flex items-center">
                          <p className="text-xs font-medium text-rose-700">{moneyFormatter.format(row.expense)} VND</p>
                        </div>
                        <div className="flex items-center">
                          <p className={`text-xs font-semibold ${row.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {row.profit >= 0 ? "+" : ""}
                            {moneyFormatter.format(row.profit)} VND
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {!sortedTeamSummary.length ? <p className="text-sm text-muted-foreground">Chưa có dữ liệu để so sánh team.</p> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Biểu đồ thu chi</CardTitle>
            <CardDescription>
              {new Intl.DateTimeFormat("vi-VN").format(range.from)} - {new Intl.DateTimeFormat("vi-VN").format(range.to)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[260px] w-full sm:h-[320px]">
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tickFormatter={(value) => moneyFormatter.format(Number(value))} width={90} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="thu"
                  stroke="var(--color-thu)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="chi"
                  stroke="var(--color-chi)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Biểu đồ lợi nhuận</CardTitle>
            <CardDescription>
              Giá trị lợi nhuận = Thu - Chi trong từng mốc thời gian
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[260px] w-full sm:h-[320px]">
              <LineChart data={profitChartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tickFormatter={(value) => moneyFormatter.format(Number(value))} width={90} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="loiNhuan"
                  stroke="var(--color-loiNhuan)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
