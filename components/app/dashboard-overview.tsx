"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  CalendarIcon,
  Minus,
} from "lucide-react";
import { type DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DashboardTransaction = {
  id: string;
  direction: "IN" | "OUT";
  amountVnd: number;
  transactionDate: string;
  categoryName: string;
  categoryParentName: string | null;
  categoryPath: string[];
  categoryRootName: string;
  categorySubPath: string | null;
  teamUsers: Array<{ id: string; name: string }>;
  description: string;
  paymentAccount: { id: string; accountName: string; bankName: string; accountNumber: string } | null;
};

type OverviewProps = {
  teamUsers: Array<{ id: string; name: string }>;
  transactions: DashboardTransaction[];
  title?: string;
  description?: string;
  /** "compact" keeps headline tiles and category pies; "category-only" keeps totals and one scoped pie section. */
  variant?: "full" | "compact" | "category-only";
};

type PeriodKey = "THIS_MONTH" | "LAST_MONTH" | "1M" | "3M" | "12M" | "THIS_YEAR" | "LAST_YEAR" | "ALL";
type BreakdownSortKey = "income" | "expense" | "profit" | "count";
type SortDirection = "asc" | "desc";
type BreakdownRow = {
  key: string;
  name: string;
  subLabel: string | null;
  income: number;
  expense: number;
  profit: number;
  count: number;
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

// Teal / orange / blue: validated for deuteran, protan and tritan separation on both
// the light and the dark chart surface, so Thu vs Chi never relies on a red/green pair.
const CHART_COLORS = {
  thu: "#0d9488",
  chi: "#ea580c",
  loiNhuan: "#3b82f6",
};

// Slices of one pie are parts of a single measure, so they use one hue stepped by
// lightness (darkest = biggest). Lightness ordering stays readable under any colour
// vision, which a 6-hue categorical set does not.
const SLICE_RAMPS = {
  income: ["#115e59", "#0f766e", "#0d9488", "#14b8a6", "#2dd4bf", "#99f6e4"],
  expense: ["#9a3412", "#c2410c", "#ea580c", "#f97316", "#fb923c", "#fed7aa"],
};
const MAX_PIE_SLICES = 6;

type CategoryPieGroup = {
  key: string;
  title: string;
  subTitle: string | null;
  total: number;
  slices: Array<{ name: string; value: number; share: number }>;
};

const UNGROUPED_PIE_KEY = "__UNGROUPED__";
const UNASSIGNED_USER_KEY = "__UNASSIGNED__";
const UNASSIGNED_ACCOUNT_KEY = "__NO_ACCOUNT__";

const moneyFormatter = new Intl.NumberFormat("vi-VN");

function formatMoney(value: number) {
  return `${moneyFormatter.format(Math.round(value))} VND`;
}

function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${moneyFormatter.format(abs)}`;
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getPeriodRange(period: PeriodKey, baseDate: Date) {
  const today = normalizeDate(baseDate);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  if (period === "THIS_MONTH") {
    return { from: new Date(currentYear, currentMonth, 1), to: today, granularity: "day" as const };
  }
  if (period === "LAST_MONTH") {
    return {
      from: new Date(currentYear, currentMonth - 1, 1),
      to: new Date(currentYear, currentMonth, 0),
      granularity: "day" as const,
    };
  }
  if (period === "1M") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from, to: today, granularity: "day" as const };
  }
  if (period === "3M") {
    return { from: new Date(currentYear, currentMonth - 2, 1), to: today, granularity: "month" as const };
  }
  if (period === "12M") {
    return { from: new Date(currentYear, currentMonth - 11, 1), to: today, granularity: "month" as const };
  }
  if (period === "THIS_YEAR") {
    return { from: new Date(currentYear, 0, 1), to: today, granularity: "month" as const };
  }
  if (period === "ALL") {
    return { from: new Date(2000, 0, 1), to: today, granularity: "month" as const };
  }
  return {
    from: new Date(currentYear - 1, 0, 1),
    to: new Date(currentYear - 1, 11, 31),
    granularity: "month" as const,
  };
}

// The previous window has the same length and sits immediately before the current one,
// so every KPI delta compares like with like.
function getPreviousRange(from: Date, to: Date) {
  const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(from);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - (spanDays - 1));
  return { from: normalizeDate(previousFrom), to: normalizeDate(previousTo) };
}

function inRange(date: Date, from: Date, to: Date) {
  const value = normalizeDate(date).getTime();
  return value >= from.getTime() && value <= to.getTime();
}

function accountLabel(account: DashboardTransaction["paymentAccount"]) {
  if (!account) return { key: UNASSIGNED_ACCOUNT_KEY, name: "Chưa gắn tài khoản", subLabel: null };
  return {
    key: account.id,
    name: account.bankName,
    subLabel: `${account.accountName} • ${account.accountNumber}`,
  };
}

function DeltaBadge({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0) {
    return <span className="text-xs text-muted-foreground">Kỳ trước không có dữ liệu</span>;
  }
  const changeRatio = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(changeRatio * 10) / 10;
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" aria-hidden />
        Không đổi so với kỳ trước
      </span>
    );
  }
  const isUp = rounded > 0;
  const isGood = invert ? !isUp : isUp;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${isGood ? "text-emerald-700" : "text-rose-700"}`}
    >
      <Icon className="size-3" aria-hidden />
      {isUp ? "+" : ""}
      {rounded}% so với kỳ trước
    </span>
  );
}

function StatTile({
  label,
  value,
  hint,
  valueClassName = "",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="gap-0 p-0">
      <CardHeader className="gap-1 p-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <p className={`text-xl font-semibold tabular-nums sm:text-2xl ${valueClassName}`}>{value}</p>
        {hint ? <div className="pt-0.5">{hint}</div> : null}
      </CardHeader>
    </Card>
  );
}

function CategoryPieCard({ group, tone }: { group: CategoryPieGroup; tone: "income" | "expense" }) {
  const ramp = SLICE_RAMPS[tone];
  const chartConfig = Object.fromEntries(
    group.slices.map((slice, index) => [slice.name, { label: slice.name, color: ramp[index % ramp.length] }])
  );

  return (
    <Card className="gap-3">
      <CardHeader className="gap-0.5 pb-0">
        <CardTitle className="text-base">{group.title}</CardTitle>
        <CardDescription>
          {group.subTitle ? `${group.subTitle} · ` : ""}
          {formatMoney(group.total)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChartContainer config={chartConfig} className="mx-auto h-[190px] w-full">
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => `${name}: ${formatMoney(Number(value))}`}
                />
              }
            />
            <Pie
              data={group.slices}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={78}
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {group.slices.map((slice, index) => (
                <Cell key={slice.name} fill={ramp[index % ramp.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <ul className="space-y-1.5">
          {group.slices.map((slice, index) => (
            <li key={slice.name} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: ramp[index % ramp.length] }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{slice.share.toFixed(1)}%</span>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(slice.value)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: BreakdownSortKey;
  activeKey: BreakdownSortKey;
  direction: SortDirection;
  onSort: (key: BreakdownSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className="inline-flex items-center justify-end gap-1 text-right"
      onClick={() => onSort(sortKey)}
      aria-label={`Sắp xếp theo ${label}${active ? (direction === "asc" ? " tăng dần" : " giảm dần") : ""}`}
    >
      {label}
      <ArrowUpDown className={`size-3.5 ${active ? "opacity-100" : "opacity-40"}`} />
    </button>
  );
}

function BreakdownSection({
  title,
  description,
  rows,
  sortKey,
  sortDirection,
  onSort,
  nameHeader,
}: {
  title: string;
  description: string;
  rows: BreakdownRow[];
  sortKey: BreakdownSortKey;
  sortDirection: SortDirection;
  onSort: (key: BreakdownSortKey) => void;
  nameHeader: string;
}) {
  const chartConfig = {
    thu: { label: "Thu", color: CHART_COLORS.thu },
    chi: { label: "Chi", color: CHART_COLORS.chi },
  };
  const chartRows = rows.slice(0, 8).map((row) => ({
    label: row.name.length > 18 ? `${row.name.slice(0, 17)}…` : row.name,
    thu: row.income,
    chi: row.expense,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length ? (
          <>
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={12} barGap={2}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => formatCompactMoney(Number(value))} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value, name) => `${name === "thu" ? "Thu" : "Chi"}: ${formatMoney(Number(value))}`} />}
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="thu" fill="var(--color-thu)" radius={[0, 4, 4, 0]} barSize={10} />
                <Bar dataKey="chi" fill="var(--color-chi)" radius={[0, 4, 4, 0]} barSize={10} />
              </BarChart>
            </ChartContainer>

            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_0.7fr] gap-3 bg-muted/40 px-3 py-2 text-xs font-semibold">
                  <p>{nameHeader}</p>
                  <SortableHeader label="Thu" sortKey="income" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                  <SortableHeader label="Chi" sortKey="expense" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                  <SortableHeader label="Lợi nhuận" sortKey="profit" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                  <SortableHeader label="Số GD" sortKey="count" activeKey={sortKey} direction={sortDirection} onSort={onSort} />
                </div>
                <ul className="divide-y">
                  {rows.map((row) => (
                    <li key={row.key} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_0.7fr] items-center gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        {row.subLabel ? <p className="truncate text-xs text-muted-foreground">{row.subLabel}</p> : null}
                      </div>
                      <p className="text-right text-xs font-medium tabular-nums">{formatMoney(row.income)}</p>
                      <p className="text-right text-xs font-medium tabular-nums">{formatMoney(row.expense)}</p>
                      <p
                        className={`text-right text-xs font-semibold tabular-nums ${
                          row.profit >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {row.profit >= 0 ? "+" : ""}
                        {formatMoney(row.profit)}
                      </p>
                      <p className="text-right text-xs tabular-nums text-muted-foreground">{row.count}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Không có dữ liệu trong kỳ đã chọn.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardOverview({
  transactions,
  teamUsers,
  title = "Dashboard tài chính",
  description,
  variant = "full",
}: OverviewProps) {
  const isCompact = variant === "compact";
  const isCategoryOnly = variant === "category-only";
  const [period, setPeriod] = useState<PeriodKey>("THIS_YEAR");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [teamUserFilter, setTeamUserFilter] = useState("__ALL__");
  const [accountFilter, setAccountFilter] = useState("__ALL__");
  const [userSortKey, setUserSortKey] = useState<BreakdownSortKey>("expense");
  const [userSortDirection, setUserSortDirection] = useState<SortDirection>("desc");
  const [bankSortKey, setBankSortKey] = useState<BreakdownSortKey>("expense");
  const [bankSortDirection, setBankSortDirection] = useState<SortDirection>("desc");
  const now = useMemo(() => new Date(), []);

  const teamOptions = useMemo(() => teamUsers.toSorted((a, b) => a.name.localeCompare(b.name, "vi")), [teamUsers]);
  const accountOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const transaction of transactions) {
      if (!transaction.paymentAccount) continue;
      const account = transaction.paymentAccount;
      map.set(account.id, { id: account.id, label: `${account.bankName} - ${account.accountNumber}` });
    }
    return Array.from(map.values()).toSorted((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [transactions]);

  const analytics = useMemo(() => {
    let range = getPeriodRange(period, now);
    if (customDateRange?.from) {
      const first = normalizeDate(customDateRange.from);
      const second = normalizeDate(customDateRange.to ?? customDateRange.from);
      const safeFrom = first.getTime() <= second.getTime() ? first : second;
      const safeTo = first.getTime() <= second.getTime() ? second : first;
      const dayDiff = Math.floor((safeTo.getTime() - safeFrom.getTime()) / 86_400_000);
      range = { from: safeFrom, to: safeTo, granularity: dayDiff <= 45 ? "day" : "month" };
    }
    const { from, to } = range;
    const previousRange = getPreviousRange(from, to);

    const matchesFilters = (transaction: DashboardTransaction) =>
      (teamUserFilter === "__ALL__" || transaction.teamUsers.some((member) => member.id === teamUserFilter)) &&
      (accountFilter === "__ALL__" || transaction.paymentAccount?.id === accountFilter);

    const currentTransactions = transactions.filter(
      (transaction) => matchesFilters(transaction) && inRange(new Date(transaction.transactionDate), from, to)
    );
    const previousTransactions = transactions.filter(
      (transaction) =>
        matchesFilters(transaction) && inRange(new Date(transaction.transactionDate), previousRange.from, previousRange.to)
    );

    let incomeTotal = 0;
    let expenseTotal = 0;
    type PieAccumulator = { title: string; subTitle: string | null; slices: Map<string, number> };
    const incomeMap = new Map<string, PieAccumulator>();
    const expenseMap = new Map<string, PieAccumulator>();
    const userMap = new Map<string, BreakdownRow>();
    const accountMap = new Map<string, BreakdownRow>();

    if (teamUserFilter === "__ALL__") {
      for (const member of teamOptions) {
        userMap.set(member.id, { key: member.id, name: member.name, subLabel: null, income: 0, expense: 0, profit: 0, count: 0 });
      }
    }

    for (const transaction of currentTransactions) {
      const isIncome = transaction.direction === "IN";
      const amount = transaction.amountVnd;

      if (isIncome) incomeTotal += amount;
      else expenseTotal += amount;

      // One pie per level-2 category; its slices are the level-3 children underneath it.
      // Shallower trees fall back to their level-1 parent, and still-unstructured
      // categories collect in one pie so nothing silently disappears from the report.
      const path = transaction.categoryPath.length ? transaction.categoryPath : [transaction.categoryName];
      const group =
        path.length >= 3
          ? { key: `${path[0]} / ${path[1]}`, title: path[1], subTitle: path[0] }
          : path.length === 2
            ? { key: path[0], title: path[0], subTitle: null }
            : { key: UNGROUPED_PIE_KEY, title: "Chưa xếp vào danh mục cấp 2", subTitle: null };
      const sliceName = path[path.length - 1];
      const categoryMap = isIncome ? incomeMap : expenseMap;
      const current =
        categoryMap.get(group.key) ?? { title: group.title, subTitle: group.subTitle, slices: new Map<string, number>() };
      current.slices.set(sliceName, (current.slices.get(sliceName) ?? 0) + amount);
      categoryMap.set(group.key, current);

      const members = transaction.teamUsers.length
        ? transaction.teamUsers.map((member) => ({ key: member.id, name: member.name }))
        : [{ key: UNASSIGNED_USER_KEY, name: "Không gắn nhân viên" }];
      for (const member of members) {
        const current =
          userMap.get(member.key) ??
          ({ key: member.key, name: member.name, subLabel: null, income: 0, expense: 0, profit: 0, count: 0 } as BreakdownRow);
        if (isIncome) current.income += amount;
        else current.expense += amount;
        current.count += 1;
        userMap.set(member.key, current);
      }

      const account = accountLabel(transaction.paymentAccount);
      const currentAccount =
        accountMap.get(account.key) ??
        ({ key: account.key, name: account.name, subLabel: account.subLabel, income: 0, expense: 0, profit: 0, count: 0 } as BreakdownRow);
      if (isIncome) currentAccount.income += amount;
      else currentAccount.expense += amount;
      currentAccount.count += 1;
      accountMap.set(account.key, currentAccount);
    }

    let previousIncome = 0;
    let previousExpense = 0;
    for (const transaction of previousTransactions) {
      if (transaction.direction === "IN") previousIncome += transaction.amountVnd;
      else previousExpense += transaction.amountVnd;
    }

    const toPieGroups = (source: Map<string, PieAccumulator>): CategoryPieGroup[] =>
      Array.from(source.entries())
        .map(([key, value]) => {
          const ordered = Array.from(value.slices.entries())
            .map(([name, amount]) => ({ name, value: Math.round(amount) }))
            .sort((a, b) => b.value - a.value);
          // A pie stays readable up to six parts, so the tail folds into one slice.
          const head = ordered.slice(0, MAX_PIE_SLICES - 1);
          const tail = ordered.slice(MAX_PIE_SLICES - 1);
          const merged = tail.length
            ? [...head, { name: `Khác (${tail.length} mục)`, value: tail.reduce((sum, item) => sum + item.value, 0) }]
            : ordered;
          const total = merged.reduce((sum, item) => sum + item.value, 0);
          return {
            key,
            title: value.title,
            subTitle: value.subTitle,
            total,
            slices: merged.map((item) => ({
              ...item,
              share: total > 0 ? (item.value / total) * 100 : 0,
            })),
          };
        })
        .filter((group) => group.total > 0)
        .sort((a, b) => b.total - a.total);

    const finalizeBreakdown = (source: Map<string, BreakdownRow>) =>
      Array.from(source.values()).map((row) => ({
        ...row,
        income: Math.round(row.income),
        expense: Math.round(row.expense),
        profit: Math.round(row.income - row.expense),
      }));

    return {
      range,
      previousRange,
      incomeTotal: Math.round(incomeTotal),
      expenseTotal: Math.round(expenseTotal),
      previousIncome: Math.round(previousIncome),
      previousExpense: Math.round(previousExpense),
      transactionCount: currentTransactions.length,
      previousTransactionCount: previousTransactions.length,
      incomeByCategory: toPieGroups(incomeMap),
      expenseByCategory: toPieGroups(expenseMap),
      userBreakdown: finalizeBreakdown(userMap),
      accountBreakdown: finalizeBreakdown(accountMap),
    };
  }, [
    period,
    transactions,
    now,
    customDateRange,
    teamUserFilter,
    accountFilter,
    teamOptions,
  ]);

  const profit = analytics.incomeTotal - analytics.expenseTotal;
  const previousProfit = analytics.previousIncome - analytics.previousExpense;
  const expenseRatio = analytics.incomeTotal > 0 ? (analytics.expenseTotal / analytics.incomeTotal) * 100 : 0;

  const sortRows = (rows: BreakdownRow[], key: BreakdownSortKey, direction: SortDirection) => {
    const factor = direction === "asc" ? 1 : -1;
    return rows.toSorted((a, b) => {
      const diff = (a[key] - b[key]) * factor;
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "vi");
    });
  };
  const sortedUserRows = useMemo(
    () => sortRows(analytics.userBreakdown, userSortKey, userSortDirection),
    [analytics.userBreakdown, userSortKey, userSortDirection]
  );
  const sortedAccountRows = useMemo(
    () => sortRows(analytics.accountBreakdown, bankSortKey, bankSortDirection),
    [analytics.accountBreakdown, bankSortKey, bankSortDirection]
  );

  function toggleUserSort(nextKey: BreakdownSortKey) {
    if (userSortKey === nextKey) {
      setUserSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setUserSortKey(nextKey);
    setUserSortDirection("desc");
  }

  function toggleBankSort(nextKey: BreakdownSortKey) {
    if (bankSortKey === nextKey) {
      setBankSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setBankSortKey(nextKey);
    setBankSortDirection("desc");
  }

  const rangeLabel = `${new Intl.DateTimeFormat("vi-VN").format(analytics.range.from)} - ${new Intl.DateTimeFormat(
    "vi-VN"
  ).format(analytics.range.to)}`;
  const previousRangeLabel = `${new Intl.DateTimeFormat("vi-VN").format(analytics.previousRange.from)} - ${new Intl.DateTimeFormat(
    "vi-VN"
  ).format(analytics.previousRange.to)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          <p className="text-sm text-muted-foreground">
            Kỳ báo cáo {rangeLabel} · So sánh với {previousRangeLabel}
          </p>
        </div>
        <Badge variant="outline" className="font-normal">
          {analytics.transactionCount} giao dịch trong kỳ
        </Badge>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4 [&>div]:w-full sm:[&>div]:w-auto">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">Kỳ báo cáo</p>
            <div className="max-w-full overflow-x-auto overflow-y-hidden">
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
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Khoảng ngày tùy chọn</p>
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="h-9 w-full sm:w-[210px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 size-4" />
                    {customDateRange?.from
                      ? `${customDateRange.from.toLocaleDateString("vi-VN")} - ${
                          customDateRange.to ? customDateRange.to.toLocaleDateString("vi-VN") : "..."
                        }`
                      : "Chưa chọn"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" numberOfMonths={2} selected={customDateRange} onSelect={setCustomDateRange} />
                </PopoverContent>
              </Popover>
              {customDateRange?.from ? (
                <Button type="button" variant="ghost" className="h-9 px-2" onClick={() => setCustomDateRange(undefined)}>
                  Xóa
                </Button>
              ) : null}
            </div>
          </div>

          {isCategoryOnly ? null : (
            <>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Nhân viên</p>
                <Select value={teamUserFilter} onValueChange={setTeamUserFilter}>
                  <SelectTrigger className="h-9 w-full sm:w-[200px]">
                    <SelectValue placeholder="Tất cả nhân viên" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả nhân viên</SelectItem>
                    {teamOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tài khoản / ngân hàng</p>
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="h-9 w-full sm:w-[240px]">
                    <SelectValue placeholder="Tất cả tài khoản" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả tài khoản</SelectItem>
                    {accountOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className={`grid gap-3 sm:grid-cols-2 ${isCompact ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
        <StatTile
          label="Tổng thu"
          value={formatMoney(analytics.incomeTotal)}
          hint={<DeltaBadge current={analytics.incomeTotal} previous={analytics.previousIncome} />}
        />
        <StatTile
          label="Tổng chi"
          value={formatMoney(analytics.expenseTotal)}
          hint={<DeltaBadge current={analytics.expenseTotal} previous={analytics.previousExpense} invert />}
        />
        <StatTile
          label="Lợi nhuận"
          value={`${profit >= 0 ? "+" : ""}${formatMoney(profit)}`}
          valueClassName={profit >= 0 ? "text-emerald-700" : "text-rose-700"}
          hint={<DeltaBadge current={profit} previous={previousProfit} />}
        />
        <StatTile
          label="Tỷ lệ chi/thu"
          value={analytics.incomeTotal > 0 ? `${expenseRatio.toFixed(1)}%` : "-"}
          hint={<span className="text-xs text-muted-foreground">Chi chiếm bao nhiêu phần tổng thu</span>}
        />
        {isCompact || isCategoryOnly ? null : (
          <StatTile
            label="Số giao dịch"
            value={moneyFormatter.format(analytics.transactionCount)}
            hint={<DeltaBadge current={analytics.transactionCount} previous={analytics.previousTransactionCount} />}
          />
        )}
      </div>

      {isCompact || isCategoryOnly ? null : (
        <>
      <BreakdownSection
        title="Thống kê theo nhân viên"
        description="Thu, chi và lợi nhuận của từng nhân viên trong kỳ. Biểu đồ hiển thị 8 nhân viên đầu theo thứ tự đang sắp xếp."
        rows={sortedUserRows}
        sortKey={userSortKey}
        sortDirection={userSortDirection}
        onSort={toggleUserSort}
        nameHeader="Nhân viên"
      />

      <BreakdownSection
        title="Thống kê theo ngân hàng"
        description="Dòng tiền ra vào từng tài khoản thanh toán. Biểu đồ hiển thị 8 tài khoản đầu theo thứ tự đang sắp xếp."
        rows={sortedAccountRows}
        sortKey={bankSortKey}
        sortDirection={bankSortDirection}
        onSort={toggleBankSort}
        nameHeader="Ngân hàng / tài khoản"
      />
        </>
      )}

      {isCategoryOnly ? null : (
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Thu theo danh mục</h3>
          <p className="text-sm text-muted-foreground">
            Mỗi danh mục cấp 2 là một biểu đồ, từng miếng là một danh mục con. Tổng {formatMoney(analytics.incomeTotal)}
            {" "}trong kỳ.
          </p>
        </div>
        {analytics.incomeByCategory.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analytics.incomeByCategory.map((group) => (
              <CategoryPieCard key={group.key} group={group} tone="income" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Không có dữ liệu thu trong kỳ.</p>
        )}
      </section>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Chi theo danh mục</h3>
          <p className="text-sm text-muted-foreground">
            Mỗi danh mục cấp 2 là một biểu đồ, từng miếng là một danh mục con. Tổng{" "}
            {formatMoney(analytics.expenseTotal)} trong kỳ.
          </p>
        </div>
        {analytics.expenseByCategory.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {analytics.expenseByCategory.map((group) => (
              <CategoryPieCard key={group.key} group={group} tone="expense" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Không có dữ liệu chi trong kỳ.</p>
        )}
      </section>

    </div>
  );
}
