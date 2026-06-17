"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, CalendarIcon, Check, ChevronRight, Loader2 } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptImageUploader } from "@/components/app/receipt-image-uploader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Transaction = {
  id: string;
  purchaseRequestId?: string | null;
  direction: "IN" | "OUT";
  amountOriginal: string;
  amountVnd: string;
  currencyCode: "VND" | "USD";
  description: string;
  notes?: TransactionNote[];
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
  teamUsers?: Array<{
    id: string;
    fullName: string;
  }>;
  creator?: {
    fullName: string;
  } | null;
  paymentAccount?: {
    id: string;
    accountName: string;
    bankName: string;
    accountNumber: string;
    ownerName: string;
  } | null;
  category: { id: string; name: string; type: "INCOME" | "EXPENSE"; parentName?: string | null };
  receiptImages?: Array<{
    id: string;
    filePath: string;
    fileName: string;
    createdAt: string;
  }>;
  latestActivity?: {
    action: string;
    createdAt: string;
  } | null;
  latestAdjustment?: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    requestedAt: string;
    decidedAt: string | null;
  } | null;
  adjustmentCount?: number;
  timelineCount?: number;
};

type TransactionNote = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

type TimelineLog = {
  id: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorRoleSnapshot: string;
  action: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
  actor?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

type TransactionAdjustment = {
  id: string;
  transactionId: string;
  requestedBy: string;
  approvedBy: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  reviewNote: string | null;
  beforePayload?: {
    direction: "IN" | "OUT";
    teamUserIds?: string[];
    teamUserId?: string | null;
    categoryId: string;
    amountOriginal: number;
    currencyCode: "VND" | "USD";
    exchangeRateToVnd: number;
    amountVnd: number;
    description: string;
    transactionDate: string;
    paymentAccountId: string | null;
  } | null;
  afterPayload?: {
    direction: "IN" | "OUT";
    teamUserIds?: string[];
    teamUserId?: string | null;
    categoryId: string;
    amountOriginal: number;
    currencyCode: "VND" | "USD";
    exchangeRateToVnd: number;
    amountVnd: number;
    description: string;
    transactionDate: string;
    paymentAccountId: string | null;
  } | null;
  payload: {
    direction: "IN" | "OUT";
    teamUserIds?: string[];
    teamUserId?: string | null;
    categoryId: string;
    amountOriginal: number;
    currencyCode: "VND" | "USD";
    exchangeRateToVnd: number;
    amountVnd: number;
    description: string;
    transactionDate: string;
    paymentAccountId: string | null;
  };
  requestedAt: string;
  decidedAt: string | null;
  requester: { id: string; fullName: string; email: string };
  approver?: { id: string; fullName: string; email: string } | null;
  transaction?: {
    id: string;
    description: string;
    amountOriginal: string;
    currencyCode: "VND" | "USD";
    transactionDate: string;
    category: { id: string; name: string };
  };
};

function adjustmentStatusMeta(status: TransactionAdjustment["status"]) {
  if (status === "APPROVED") {
    return { label: "Đã duyệt", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (status === "REJECTED") {
    return { label: "Từ chối", className: "border-rose-200 bg-rose-100 text-rose-700" };
  }
  return { label: "Chờ duyệt", className: "border-amber-200 bg-amber-100 text-amber-700" };
}

function categoryLabelById(categories: Category[], id: string | null | undefined) {
  if (!id) return "-";
  return categories.find((item) => item.id === id)?.name ?? id;
}

function teamUserLabelById(teamUsers: TeamUser[], id: string | null | undefined) {
  if (!id) return "-";
  return teamUsers.find((item) => item.id === id)?.fullName ?? id;
}

function teamUsersLabel(
  teamUsers: TeamUser[],
  payload: { teamUserIds?: string[]; teamUserId?: string | null } | null | undefined
) {
  if (!payload) return "-";
  const ids = payload.teamUserIds ?? (payload.teamUserId ? [payload.teamUserId] : []);
  if (!ids.length) return "-";
  return ids.map((id) => teamUsers.find((item) => item.id === id)?.fullName ?? id).join(", ");
}

function paymentAccountLabelById(paymentAccounts: PaymentAccount[], id: string | null | undefined) {
  if (!id) return "-";
  const account = paymentAccounts.find((item) => item.id === id);
  return account ? `${account.accountName} - ${account.bankName}` : id;
}

function directionLabel(value: "IN" | "OUT" | null | undefined) {
  if (value === "IN") return "Thu";
  if (value === "OUT") return "Chi";
  return "-";
}

type Category = {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  parentId?: string | null;
  parentName?: string | null;
};

function categoryDisplayName(category: Pick<Category, "name" | "parentName">) {
  return category.parentName ? `${category.parentName} / ${category.name}` : category.name;
}

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
};

type PaymentAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
  isActive: boolean;
};

type AuthMeResponse = {
  user?: {
    email?: string;
    roles?: string[];
  };
};

type CategoriesResponse = {
  rows?: Category[];
  error?: string;
};

type TeamUsersResponse = {
  rows?: TeamUser[];
  error?: string;
};

type PaymentAccountsResponse = {
  rows?: PaymentAccount[];
  error?: string;
};

type TransactionsResponse = {
  rows?: Transaction[];
  error?: string;
};

type TransactionNotesResponse = {
  rows?: TransactionNote[];
  error?: string;
};

type SortKey = "transactionDate" | "amountOriginal";
type SortDirection = "asc" | "desc";
type QuickPeriodKey = "THIS_MONTH" | "LAST_MONTH" | "1M" | "3M" | "12M" | "THIS_YEAR" | "LAST_YEAR" | "ALL" | "CUSTOM";
type DirectionFilter = "__ALL__" | "IN" | "OUT";
type AdjustedFilter = "__ALL__" | "YES" | "NO";
type AdjustmentStatusFilter = "__ALL__" | "PENDING" | "APPROVED" | "REJECTED" | "__NONE__";
type CreateDirection = "IN" | "OUT";

const SPECIAL_DELETE_EMAIL = "ngobao@bugmedia.vn";

const QUICK_PERIODS: Array<{ key: Exclude<QuickPeriodKey, "CUSTOM">; label: string }> = [
  { key: "THIS_MONTH", label: "Tháng này" },
  { key: "LAST_MONTH", label: "Tháng trước" },
  { key: "1M", label: "1 tháng" },
  { key: "3M", label: "3 tháng" },
  { key: "12M", label: "1 năm" },
  { key: "THIS_YEAR", label: "Năm nay" },
  { key: "LAST_YEAR", label: "Năm trước" },
  { key: "ALL", label: "Tất cả" },
];

function toLocalDateTimeInputValue(date: Date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function parseDateParam(input: string | null) {
  if (!input) return undefined;
  const [yearRaw, monthRaw, dayRaw] = input.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function formatDateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getQuickPeriodRange(period: Exclude<QuickPeriodKey, "CUSTOM">, baseDate: Date): DateRange | undefined {
  const today = normalizeDate(baseDate);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  if (period === "ALL") return undefined;
  if (period === "THIS_MONTH") {
    return { from: new Date(currentYear, currentMonth, 1), to: today };
  }
  if (period === "LAST_MONTH") {
    return { from: new Date(currentYear, currentMonth - 1, 1), to: new Date(currentYear, currentMonth, 0) };
  }
  if (period === "1M") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from, to: today };
  }
  if (period === "3M") {
    return { from: new Date(today.getFullYear(), today.getMonth() - 2, 1), to: today };
  }
  if (period === "12M") {
    return { from: new Date(today.getFullYear(), today.getMonth() - 11, 1), to: today };
  }
  if (period === "THIS_YEAR") {
    return { from: new Date(currentYear, 0, 1), to: today };
  }
  return { from: new Date(currentYear - 1, 0, 1), to: new Date(currentYear - 1, 11, 31) };
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function toFilenameSlug(input: string, maxLength = 24) {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return "na";
  return normalized.slice(0, maxLength);
}

const VN_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readThreeDigits(num: number, isLeadingGroup: boolean) {
  const hundred = Math.floor(num / 100);
  const ten = Math.floor((num % 100) / 10);
  const unit = num % 10;
  const parts: string[] = [];

  if (hundred > 0 || !isLeadingGroup) {
    parts.push(`${VN_DIGITS[hundred]} trăm`);
  }

  if (ten > 1) {
    parts.push(`${VN_DIGITS[ten]} mươi`);
    if (unit === 1) parts.push("mốt");
    else if (unit === 4) parts.push("tư");
    else if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(VN_DIGITS[unit]);
  } else if (ten === 1) {
    parts.push("mười");
    if (unit === 5) parts.push("lăm");
    else if (unit > 0) parts.push(VN_DIGITS[unit]);
  } else {
    if (unit > 0 && (hundred > 0 || !isLeadingGroup)) {
      parts.push("lẻ");
    }
    if (unit > 0) {
      parts.push(unit === 5 && (hundred > 0 || !isLeadingGroup) ? "năm" : VN_DIGITS[unit]);
    }
  }

  return parts.join(" ").trim();
}

function integerToVietnameseWords(value: number) {
  if (!Number.isFinite(value) || value < 0) return "";
  if (value === 0) return "không";

  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const groups: number[] = [];
  let remaining = Math.floor(value);

  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const groupValue = groups[i];
    if (groupValue === 0) continue;
    const groupText = readThreeDigits(groupValue, i === groups.length - 1);
    const unit = units[i] ?? "";
    parts.push([groupText, unit].filter(Boolean).join(" "));
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function amountToWords(amount: number, currency: "VND" | "USD") {
  if (!Number.isFinite(amount) || amount < 0) return "";
  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);
  const integerText = integerToVietnameseWords(integerPart);

  if (currency === "VND") {
    return `${integerText} đồng`;
  }

  if (decimalPart > 0) {
    return `${integerText} đô la Mỹ ${integerToVietnameseWords(decimalPart)} xu`;
  }
  return `${integerText} đô la Mỹ`;
}

function mapActionLabel(action: string) {
  const labels: Record<string, string> = {
    "transaction.create": "Tạo giao dịch",
    "transaction.update": "Chỉnh sửa giao dịch",
    "transaction.note.add": "Thêm ghi chú",
    "purchase_request.create": "Tạo yêu cầu mua",
    "purchase_request.submit": "Gửi duyệt yêu cầu mua",
    "purchase_request.approve": "Phê duyệt yêu cầu mua",
    "purchase_request.reject": "Từ chối yêu cầu mua",
    "purchase_request.pay": "Xác nhận chuyển tiền",
    "receipt_image.create": "Tải ảnh chứng từ",
    "receipt_image.delete": "Xóa ảnh chứng từ",
    "payment_account.create": "Tạo tài khoản thanh toán",
    "payment_account.update": "Cập nhật tài khoản thanh toán",
    "transaction.adjustment.request": "Gửi yêu cầu điều chỉnh giao dịch",
    "transaction.adjustment.approve": "Duyệt điều chỉnh giao dịch",
    "transaction.adjustment.reject": "Từ chối điều chỉnh giao dịch",
  };
  return labels[action] ?? action;
}

function actionBadgeClass(action: string) {
  if (action.includes("failed") || action.includes("reject")) {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }
  if (action.includes("delete")) {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  if (action.includes("login") || action.includes("logout")) {
    return "bg-sky-100 text-sky-700 border-sky-200";
  }
  if (action.includes("approve") || action.includes("pay")) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function TeamUserMultiSelect({
  teamUsers,
  selectedIds,
  onChange,
  disabled,
}: {
  teamUsers: TeamUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selectedIds);
  const selectedNames = teamUsers.filter((user) => selectedSet.has(user.id)).map((user) => user.fullName);

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-9 w-full justify-start whitespace-normal text-left font-normal"
          disabled={disabled}
        >
          {selectedNames.length ? selectedNames.join(", ") : "Chọn nhân viên"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="max-h-[260px] overflow-y-auto p-1">
          {teamUsers.length ? (
            teamUsers.map((user) => {
              const checked = selectedSet.has(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggle(user.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      checked ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                    }`}
                  >
                    {checked ? <Check className="size-3" /> : null}
                  </span>
                  {user.fullName}
                </button>
              );
            })
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Không có nhân viên.</p>
          )}
        </div>
        {selectedNames.length ? (
          <div className="flex items-center justify-between border-t p-2">
            <span className="text-xs text-muted-foreground">{selectedNames.length} đã chọn</span>
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange([])}>
              Bỏ chọn
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export default function TransactionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createTeamUserIds, setCreateTeamUserIds] = useState<string[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [createPaymentAccountId, setCreatePaymentAccountId] = useState("");
  const [createDirection, setCreateDirection] = useState<CreateDirection>("OUT");
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [createCategoryPickerOpen, setCreateCategoryPickerOpen] = useState(false);
  const [expandedCreateCategoryParents, setExpandedCreateCategoryParents] = useState<string[]>([]);
  const [createAmountInput, setCreateAmountInput] = useState("");
  const [createCurrencyCode, setCreateCurrencyCode] = useState<"VND" | "USD">("VND");
  const [createDescription, setCreateDescription] = useState("");
  const [createTransactionDate, setCreateTransactionDate] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [createReceiptFiles, setCreateReceiptFiles] = useState<File[]>([]);
  const [creating, setCreating] = useState(false);
  const [addingReceiptFor, setAddingReceiptFor] = useState<{ id: string; title: string } | null>(null);
  const [addReceiptFiles, setAddReceiptFiles] = useState<File[]>([]);
  const [addingReceipt, setAddingReceipt] = useState(false);
  const [deletingTransactionReceiptId, setDeletingTransactionReceiptId] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>(() => {
    const from = parseDateParam(searchParams.get("from"));
    const to = parseDateParam(searchParams.get("to"));
    if (!from && !to) return undefined;
    return { from, to };
  });
  const [draftPeriod, setDraftPeriod] = useState<QuickPeriodKey>(() => {
    const value = searchParams.get("period");
    const hasManualRange = Boolean(searchParams.get("from") || searchParams.get("to"));
    const validKeys = new Set<QuickPeriodKey>([
      "THIS_MONTH",
      "LAST_MONTH",
      "1M",
      "3M",
      "12M",
      "THIS_YEAR",
      "LAST_YEAR",
      "ALL",
      "CUSTOM",
    ]);
    if (validKeys.has(value as QuickPeriodKey)) return value as QuickPeriodKey;
    return hasManualRange ? "CUSTOM" : "ALL";
  });
  const [draftSearch, setDraftSearch] = useState(() => searchParams.get("q") ?? "");
  const [draftTeamUserId, setDraftTeamUserId] = useState(() => searchParams.get("teamUserId") ?? "__ALL__");
  const [draftDirection, setDraftDirection] = useState<DirectionFilter>(() => {
    const value = searchParams.get("direction");
    if (value === "IN" || value === "OUT") return value;
    return "__ALL__";
  });
  const [draftCategoryId, setDraftCategoryId] = useState(() => searchParams.get("categoryId") ?? "__ALL__");
  const [draftAdjusted, setDraftAdjusted] = useState<AdjustedFilter>(() => {
    const value = searchParams.get("adjusted");
    if (value === "YES" || value === "NO") return value;
    return "__ALL__";
  });
  const [draftAdjustmentStatus, setDraftAdjustmentStatus] = useState<AdjustmentStatusFilter>(() => {
    const value = searchParams.get("adjustmentStatus");
    if (value === "PENDING" || value === "APPROVED" || value === "REJECTED" || value === "__NONE__") return value;
    return "__ALL__";
  });
  const [draftPaymentAccountId, setDraftPaymentAccountId] = useState(
    () => searchParams.get("paymentAccountId") ?? "__ALL__"
  );
  const [receiptModal, setReceiptModal] = useState<{
    title: string;
    images: Array<{ id: string; filePath: string; fileName: string }>;
  } | null>(null);
  const [timelineRows, setTimelineRows] = useState<TimelineLog[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineCache, setTimelineCache] = useState<Record<string, TimelineLog[]>>({});
  const [pendingAdjustments, setPendingAdjustments] = useState<TransactionAdjustment[]>([]);
  const [reviewingAdjustmentId, setReviewingAdjustmentId] = useState<string | null>(null);
  const [adjustmentReviewModal, setAdjustmentReviewModal] = useState<TransactionAdjustment | null>(null);
  const [adjustingRow, setAdjustingRow] = useState<Transaction | null>(null);
  const [adjustmentHistory, setAdjustmentHistory] = useState<TransactionAdjustment[]>([]);
  const [adjustmentHistoryLoading, setAdjustmentHistoryLoading] = useState(false);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustTeamUserIds, setAdjustTeamUserIds] = useState<string[]>([]);
  const [adjustPaymentAccountId, setAdjustPaymentAccountId] = useState("");
  const [adjustCategoryId, setAdjustCategoryId] = useState("");
  const [adjustAmountInput, setAdjustAmountInput] = useState("");
  const [adjustCurrencyCode, setAdjustCurrencyCode] = useState<"VND" | "USD">("VND");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustTransactionDate, setAdjustTransactionDate] = useState("");
  const [sendingAdjustment, setSendingAdjustment] = useState(false);
  const [detailModal, setDetailModal] = useState<Transaction | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("transactionDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [filterLoading, setFilterLoading] = useState(false);
  const [openingDetailRowId, setOpeningDetailRowId] = useState<string | null>(null);
  const [openingAdjustRowId, setOpeningAdjustRowId] = useState<string | null>(null);
  const hasInitializedAutoFilter = useRef(false);
  const draftFromTs = draftDateRange?.from?.getTime() ?? null;
  const draftToTs = draftDateRange?.to?.getTime() ?? null;
  const pageSize = 50;
  const canCreateTransaction = roles.includes("ADMIN") || roles.includes("ACCOUNTANT");
  const canDeleteReceipt = roles.includes("ADMIN") || roles.includes("ACCOUNTANT") || currentUserEmail === SPECIAL_DELETE_EMAIL;
  const canDeleteTransaction = currentUserEmail === SPECIAL_DELETE_EMAIL;
  const createAmountValue = Number(createAmountInput);
  const createAmountInWords =
    Number.isFinite(createAmountValue) && createAmountValue >= 0
      ? amountToWords(createAmountValue, createCurrencyCode)
      : "";
  const filteredCreateCategories = useMemo(() => {
    if (createDirection === "IN") return categories.filter((category) => category.type === "INCOME");
    return categories.filter((category) => category.type === "EXPENSE");
  }, [categories, createDirection]);
  const selectedCreateCategory = useMemo(
    () => filteredCreateCategories.find((category) => category.id === createCategoryId) ?? null,
    [filteredCreateCategories, createCategoryId]
  );
  const createCategoryGroups = useMemo(() => {
    const parents = filteredCreateCategories
      .filter((category) => !category.parentId)
      .toSorted((a, b) => categoryDisplayName(a).localeCompare(categoryDisplayName(b), "vi"));
    const childrenByParentId = new Map<string, Category[]>();
    for (const category of filteredCreateCategories) {
      if (!category.parentId) continue;
      const current = childrenByParentId.get(category.parentId) ?? [];
      current.push(category);
      childrenByParentId.set(category.parentId, current);
    }
    for (const [parentId, children] of childrenByParentId.entries()) {
      childrenByParentId.set(
        parentId,
        children.toSorted((a, b) => categoryDisplayName(a).localeCompare(categoryDisplayName(b), "vi"))
      );
    }
    return { parents, childrenByParentId };
  }, [filteredCreateCategories]);

  const appliedPageRaw = Number(searchParams.get("page") ?? "1");
  const appliedPage = Number.isFinite(appliedPageRaw) && appliedPageRaw > 0 ? Math.floor(appliedPageRaw) : 1;
  const filteredDraftCategories = useMemo(() => {
    if (draftDirection === "IN") return categories.filter((category) => category.type === "INCOME");
    if (draftDirection === "OUT") return categories.filter((category) => category.type === "EXPENSE");
    return categories;
  }, [categories, draftDirection]);

  const transactionsApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q");
    const teamUserId = searchParams.get("teamUserId");
    const direction = searchParams.get("direction");
    const categoryId = searchParams.get("categoryId");
    const adjusted = searchParams.get("adjusted");
    const paymentAccountId = searchParams.get("paymentAccountId");

    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    if (teamUserId) params.set("teamUserId", teamUserId);
    if (direction) params.set("direction", direction);
    if (categoryId) params.set("categoryId", categoryId);
    if (adjusted) params.set("adjusted", adjusted);
    if (paymentAccountId) params.set("paymentAccountId", paymentAccountId);

    const query = params.toString();
    return query ? `/api/transactions?${query}` : "/api/transactions";
  }, [searchParams]);

  function getTimelineCacheKey(row: Pick<Transaction, "id" | "purchaseRequestId">) {
    return `${row.id}:${row.purchaseRequestId ?? "-"}`;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [meRes, categoriesRes, teamUsersRes, paymentAccountsRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }),
        fetch("/api/users/team-options", { cache: "no-store" }),
        fetch("/api/payment-accounts", { cache: "no-store" }),
      ]);
      const [meData, categoriesData, teamUsersData, paymentAccountsData] = await Promise.all([
        meRes.json().catch(() => ({})),
        categoriesRes.json().catch(() => ({})),
        teamUsersRes.json().catch(() => ({})),
        paymentAccountsRes.json().catch(() => ({})),
      ]);
      if (cancelled) return;

      if (meRes.ok) {
        const nextRoles = (meData as AuthMeResponse).user?.roles;
        setRoles(Array.isArray(nextRoles) ? nextRoles : []);
        setCurrentUserEmail(String((meData as AuthMeResponse).user?.email ?? "").toLowerCase());
      }

      if (categoriesRes.ok) {
        setCategories(Array.isArray((categoriesData as CategoriesResponse).rows) ? (categoriesData as CategoriesResponse).rows! : []);
      } else {
        toast.error((categoriesData as CategoriesResponse).error ?? "Không tải được danh mục");
      }

      if (teamUsersRes.ok) {
        setTeamUsers(
          Array.isArray((teamUsersData as TeamUsersResponse).rows) ? (teamUsersData as TeamUsersResponse).rows! : []
        );
      } else {
        toast.error((teamUsersData as TeamUsersResponse).error ?? "Không tải được danh sách nhân viên");
      }

      if (paymentAccountsRes.ok) {
        setPaymentAccounts(
          Array.isArray((paymentAccountsData as PaymentAccountsResponse).rows)
            ? (paymentAccountsData as PaymentAccountsResponse).rows!
            : []
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setFilterLoading(true);
      try {
        const rowsRes = await fetch(transactionsApiUrl, { cache: "no-store" });
        const rowsData = await rowsRes.json().catch(() => ({}));
        if (cancelled) return;

        if (rowsRes.ok) {
          setRows(Array.isArray((rowsData as TransactionsResponse).rows) ? (rowsData as TransactionsResponse).rows! : []);
        } else {
          toast.error((rowsData as TransactionsResponse).error ?? "Không tải được sổ giao dịch");
        }
      } finally {
        if (!cancelled) {
          setFilterLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transactionsApiUrl]);

  useEffect(() => {
    if (!createCategoryId) return;
    const valid = filteredCreateCategories.some((item) => item.id === createCategoryId);
    if (!valid) {
      setCreateCategoryId("");
    }
  }, [filteredCreateCategories, createCategoryId]);

  useEffect(() => {
    if (draftCategoryId === "__ALL__") return;
    const valid = filteredDraftCategories.some((item) => item.id === draftCategoryId);
    if (!valid) {
      setDraftCategoryId("__ALL__");
    }
  }, [draftCategoryId, filteredDraftCategories]);

  useEffect(() => {
    if (!roles.includes("ADMIN")) return;
    void loadPendingAdjustments();
  }, [roles]);

  async function refreshRows() {
    const rowsRes = await fetch(transactionsApiUrl, { cache: "no-store" });
    const rowsData = await rowsRes.json().catch(() => ({}));
    if (rowsRes.ok) {
      setRows(Array.isArray((rowsData as TransactionsResponse).rows) ? (rowsData as TransactionsResponse).rows! : []);
      return;
    }
    toast.error((rowsData as TransactionsResponse).error ?? "Không tải được sổ giao dịch");
  }

  async function loadPendingAdjustments() {
    if (!roles.includes("ADMIN")) {
      setPendingAdjustments([]);
      return;
    }
    const response = await fetch("/api/transactions/adjustments?status=PENDING", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error((data as { error?: string }).error ?? "Không tải được yêu cầu điều chỉnh");
      return;
    }
    setPendingAdjustments(Array.isArray((data as { rows?: TransactionAdjustment[] }).rows) ? (data as { rows?: TransactionAdjustment[] }).rows! : []);
  }

  async function openAdjustModal(row: Transaction) {
    setOpeningAdjustRowId(row.id);
    setAdjustingRow(row);
    setAdjustReason("");
    setAdjustTeamUserIds(row.teamUsers?.map((user) => user.id) ?? []);
    setAdjustPaymentAccountId(row.paymentAccount?.id ?? "");
    setAdjustCategoryId(row.category.id);
    setAdjustAmountInput(String(Number(row.amountOriginal)));
    setAdjustCurrencyCode(row.currencyCode);
    setAdjustDescription(row.description);
    setAdjustTransactionDate(toLocalDateTimeInputValue(new Date(row.transactionDate)));
    try {
      await loadAdjustmentHistory(row.id);
    } finally {
      setOpeningAdjustRowId((current) => (current === row.id ? null : current));
    }
  }

  function openDetailModal(row: Transaction) {
    setDetailModal(row);
    const cacheKey = getTimelineCacheKey(row);
    if (timelineCache[cacheKey]) {
      setOpeningDetailRowId(null);
      return;
    }
    setOpeningDetailRowId(row.id);
  }

  async function loadAdjustmentHistory(transactionId: string) {
    setAdjustmentHistoryLoading(true);
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/adjustments`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Không tải được lịch sử điều chỉnh");
        return;
      }
      setAdjustmentHistory(
        Array.isArray((data as { rows?: TransactionAdjustment[] }).rows)
          ? (data as { rows?: TransactionAdjustment[] }).rows!
          : []
      );
    } finally {
      setAdjustmentHistoryLoading(false);
    }
  }

  async function submitAdjustmentRequest() {
    if (!adjustingRow) return;
    if (adjustingRow.latestAdjustment?.status === "PENDING") {
      toast.error("Giao dịch đang có yêu cầu điều chỉnh chờ duyệt");
      return;
    }
    const amountOriginal = Number(adjustAmountInput);
    if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) {
      toast.error("Số tiền điều chỉnh phải lớn hơn 0");
      return;
    }
    if (!adjustCategoryId) {
      toast.error("Vui lòng chọn danh mục");
      return;
    }
    if (adjustDescription.trim().length < 3) {
      toast.error("Mô tả phải từ 3 ký tự");
      return;
    }
    if (adjustReason.trim().length < 5) {
      toast.error("Lý do điều chỉnh phải từ 5 ký tự");
      return;
    }
    const transactionDateIso = adjustTransactionDate ? new Date(adjustTransactionDate).toISOString() : "";
    if (!transactionDateIso) {
      toast.error("Ngày giao dịch không hợp lệ");
      return;
    }

    setSendingAdjustment(true);
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(adjustingRow.id)}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamUserIds: adjustTeamUserIds,
          paymentAccountId: adjustPaymentAccountId || undefined,
          categoryId: adjustCategoryId,
          amountOriginal,
          currencyCode: adjustCurrencyCode,
          description: adjustDescription.trim(),
          transactionDate: transactionDateIso,
          reason: adjustReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Không gửi được yêu cầu điều chỉnh");
        return;
      }
      toast.success("Đã gửi yêu cầu điều chỉnh. Chờ Admin duyệt.");
      setAdjustingRow(null);
      setAdjustReason("");
      await Promise.all([refreshRows(), loadPendingAdjustments()]);
    } finally {
      setSendingAdjustment(false);
    }
  }

  async function reviewAdjustment(adjustmentId: string, action: "APPROVE" | "REJECT") {
    setReviewingAdjustmentId(adjustmentId);
    try {
      const response = await fetch(`/api/transactions/adjustments/${encodeURIComponent(adjustmentId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: action === "REJECT" ? "Từ chối yêu cầu điều chỉnh" : "Duyệt yêu cầu điều chỉnh",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Không xử lý được yêu cầu điều chỉnh");
        return;
      }

      toast.success(action === "APPROVE" ? "Đã duyệt điều chỉnh" : "Đã từ chối điều chỉnh");
      await Promise.all([refreshRows(), loadPendingAdjustments()]);
      setAdjustmentReviewModal((current) => (current?.id === adjustmentId ? null : current));
    } finally {
      setReviewingAdjustmentId(null);
    }
  }

  async function createTransaction() {
    if (!canCreateTransaction) {
      toast.error("Bạn không có quyền tạo giao dịch");
      return;
    }
    const amountOriginal = Number(createAmountInput);
    if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) {
      toast.error("Số tiền phải lớn hơn 0");
      return;
    }
    if (!createCategoryId) {
      toast.error("Vui lòng chọn danh mục");
      return;
    }
    if (createDescription.trim().length < 3) {
      toast.error("Mô tả phải từ 3 ký tự");
      return;
    }
    const transactionDateIso = createTransactionDate ? new Date(createTransactionDate).toISOString() : "";
    setCreating(true);
    try {
      const formData = new FormData();
      formData.append("categoryId", createCategoryId);
      for (const teamUserId of createTeamUserIds) {
        formData.append("teamUserIds", teamUserId);
      }
      if (createPaymentAccountId) {
        formData.append("paymentAccountId", createPaymentAccountId);
      }
      formData.append("amountOriginal", String(amountOriginal));
      formData.append("currencyCode", createCurrencyCode);
      formData.append("description", createDescription.trim());
      if (transactionDateIso) {
        formData.append("transactionDate", transactionDateIso);
      }
      for (const file of createReceiptFiles) {
        formData.append("receiptFiles", file);
      }

      const response = await fetch("/api/transactions", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Không tạo được giao dịch");
        return;
      }

      toast.success("Đã tạo giao dịch");
      setCreateOpen(false);
      setCreateTeamUserIds([]);
      setCreatePaymentAccountId("");
      setCreateDirection("OUT");
      setCreateCategoryId("");
      setCreateAmountInput("");
      setCreateCurrencyCode("VND");
      setCreateDescription("");
      setCreateTransactionDate(toLocalDateTimeInputValue(new Date()));
      setCreateReceiptFiles([]);
      await refreshRows();
    } finally {
      setCreating(false);
    }
  }

  async function submitAddReceipts() {
    if (!addingReceiptFor) return;
    if (addReceiptFiles.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 ảnh chứng từ");
      return;
    }

    setAddingReceipt(true);
    try {
      const formData = new FormData();
      for (const file of addReceiptFiles) {
        formData.append("receiptFiles", file);
      }

      const response = await fetch(`/api/transactions/${encodeURIComponent(addingReceiptFor.id)}/receipts`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Không thêm được ảnh chứng từ");
        return;
      }

      toast.success("Đã thêm ảnh chứng từ");
      setAddingReceiptFor(null);
      setAddReceiptFiles([]);
      await refreshRows();
    } finally {
      setAddingReceipt(false);
    }
  }

  async function deleteTransactionReceipt(transactionId: string, receiptId: string) {
    setDeletingTransactionReceiptId(receiptId);
    try {
      const response = await fetch(
        `/api/transactions/${encodeURIComponent(transactionId)}/receipts/${encodeURIComponent(receiptId)}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Không xóa được ảnh chứng từ");
        return;
      }

      toast.success("Đã xóa ảnh chứng từ");
      setDetailModal((prev) => {
        if (!prev || prev.id !== transactionId) return prev;
        return {
          ...prev,
          receiptImages: (prev.receiptImages ?? []).filter((item) => item.id !== receiptId),
        };
      });
      setRows((prev) =>
        prev.map((row) =>
          row.id === transactionId
            ? { ...row, receiptImages: (row.receiptImages ?? []).filter((item) => item.id !== receiptId) }
            : row
        )
      );
    } finally {
      setDeletingTransactionReceiptId(null);
    }
  }

  async function deleteTransaction(row: Transaction) {
    const confirmed = window.confirm(
      `Xác nhận xóa giao dịch?\n\n${row.description}\n${Number(row.amountOriginal).toLocaleString("vi-VN")} ${row.currencyCode}`
    );
    if (!confirmed) return;

    setDeletingTransactionId(row.id);
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error((data as { error?: string }).error ?? "Không xóa được giao dịch");
        return;
      }

      toast.success("Đã xóa giao dịch");
      if (detailModal?.id === row.id) {
        setDetailModal(null);
      }
      await refreshRows();
      if (roles.includes("ADMIN")) {
        await loadPendingAdjustments();
      }
    } finally {
      setDeletingTransactionId(null);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  }

  const filteredRows = useMemo(() => {
    const statusFilteredRows = rows.filter((row) => {
      if (draftAdjustmentStatus === "__ALL__") return true;
      if (draftAdjustmentStatus === "__NONE__") return !row.latestAdjustment;
      return row.latestAdjustment?.status === draftAdjustmentStatus;
    });

    return statusFilteredRows.toSorted((a, b) => {
        const aHasPendingAdjustment = a.latestAdjustment?.status === "PENDING";
        const bHasPendingAdjustment = b.latestAdjustment?.status === "PENDING";
        if (aHasPendingAdjustment !== bHasPendingAdjustment) {
          return aHasPendingAdjustment ? -1 : 1;
        }

        let compare = 0;
        if (sortKey === "transactionDate") {
          compare = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
        } else if (sortKey === "amountOriginal") {
          compare = Number(a.amountOriginal) - Number(b.amountOriginal);
        }

        if (compare === 0) {
          compare = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
        }

        return sortDirection === "asc" ? compare : -compare;
      });
  }, [rows, sortKey, sortDirection, draftAdjustmentStatus]);
  const filteredTotals = useMemo(() => {
    let incomeVnd = 0;
    let expenseVnd = 0;
    for (const row of filteredRows) {
      const value = Number(row.amountVnd);
      if (!Number.isFinite(value)) continue;
      if (row.direction === "IN") {
        incomeVnd += value;
      } else {
        expenseVnd += value;
      }
    }
    return {
      incomeVnd: Math.round(incomeVnd),
      expenseVnd: Math.round(expenseVnd),
    };
  }, [filteredRows]);

  useEffect(() => {
    if (!hasInitializedAutoFilter.current) {
      hasInitializedAutoFilter.current = true;
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (draftFromTs) {
        params.set("from", formatDateParam(new Date(draftFromTs)));
      }
      if (draftToTs) {
        params.set("to", formatDateParam(new Date(draftToTs)));
      }
      if (draftSearch.trim()) {
        params.set("q", draftSearch.trim());
      }
      if (draftTeamUserId !== "__ALL__") {
        params.set("teamUserId", draftTeamUserId);
      }
      if (draftDirection !== "__ALL__") {
        params.set("direction", draftDirection);
      }
      if (draftCategoryId !== "__ALL__") {
        params.set("categoryId", draftCategoryId);
      }
      if (draftAdjusted !== "__ALL__") {
        params.set("adjusted", draftAdjusted);
      }
      if (draftAdjustmentStatus !== "__ALL__") {
        params.set("adjustmentStatus", draftAdjustmentStatus);
      }
      if (draftPaymentAccountId !== "__ALL__") {
        params.set("paymentAccountId", draftPaymentAccountId);
      }
      if (draftPeriod !== "CUSTOM") {
        params.set("period", draftPeriod);
      }
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`);
    }, draftSearch.trim() ? 250 : 0);

    return () => clearTimeout(timer);
  }, [
    draftFromTs,
    draftToTs,
    draftSearch,
    draftTeamUserId,
    draftDirection,
    draftCategoryId,
    draftAdjusted,
    draftAdjustmentStatus,
    draftPaymentAccountId,
    draftPeriod,
    pathname,
    router,
  ]);

  function clearFilters() {
    setDraftDateRange(undefined);
    setDraftPeriod("ALL");
    setDraftSearch("");
    setDraftTeamUserId("__ALL__");
    setDraftDirection("__ALL__");
    setDraftCategoryId("__ALL__");
    setDraftAdjusted("__ALL__");
    setDraftAdjustmentStatus("__ALL__");
    setDraftPaymentAccountId("__ALL__");
  }

  const hasActiveFilters =
    Boolean(draftDateRange?.from || draftDateRange?.to) ||
    Boolean(draftSearch.trim()) ||
    draftTeamUserId !== "__ALL__" ||
    draftDirection !== "__ALL__" ||
    draftCategoryId !== "__ALL__" ||
    draftAdjusted !== "__ALL__" ||
    draftAdjustmentStatus !== "__ALL__" ||
    draftPaymentAccountId !== "__ALL__" ||
    draftPeriod !== "ALL";

  function changePage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.replace(`${pathname}?${params.toString()}`);
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(appliedPage, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage]);
  const visiblePages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set<number>([1, totalPages, safePage - 1, safePage, safePage + 1]);
    if (safePage <= 3) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
    }
    if (safePage >= totalPages - 2) {
      pages.add(totalPages - 1);
      pages.add(totalPages - 2);
      pages.add(totalPages - 3);
    }

    return [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  }, [safePage, totalPages]);

  function exportCsv() {
    if (!filteredRows.length) {
      toast.error("Không có dữ liệu để xuất CSV");
      return;
    }

    const header = [
      "STT",
      "Ma giao dich",
      "Ngay giao dich",
      "Ngay tao",
      "Ngay cap nhat",
      "Loai",
      "Nguoi tao",
      "Nhan vien",
      "Tai khoan thanh toan",
      "Ngan hang",
      "So tai khoan",
      "Danh muc",
      "Mo ta",
      "So tien goc",
      "Tien te",
      "Ty gia",
      "So tien VND",
      "Yeu cau mua lien quan",
      "So ghi chu",
      "So anh chung tu",
      "Danh sach anh chung tu",
      "Co dieu chinh",
      "So lan dieu chinh",
      "Trang thai dieu chinh gan nhat",
      "Thoi gian dieu chinh gan nhat",
      "Hanh dong gan nhat",
      "Thoi gian hoat dong gan nhat",
      "So timeline",
    ];

    const lines = filteredRows.map((row, index) => {
      const paymentAccountLabel = row.paymentAccount
        ? `${row.paymentAccount.accountName} - ${row.paymentAccount.ownerName}`
        : "-";
      const latestAdjustmentStatus =
        row.latestAdjustment?.status === "APPROVED"
          ? "Da duyet"
          : row.latestAdjustment?.status === "REJECTED"
            ? "Tu choi"
            : row.latestAdjustment?.status === "PENDING"
              ? "Cho duyet"
              : "-";
      const latestAction = row.latestActivity ? mapActionLabel(row.latestActivity.action) : "-";
      const receiptNames = (row.receiptImages ?? []).map((img) => img.fileName).join(" | ");
      const amountOriginal = Number(row.amountOriginal);
      const amountVnd = Number(row.amountVnd);
      const fx =
        row.currencyCode === "USD" && Number.isFinite(amountOriginal) && amountOriginal > 0
          ? amountVnd / amountOriginal
          : 1;
      const values = [
        String(index + 1),
        row.id,
        new Date(row.transactionDate).toLocaleString("vi-VN"),
        new Date(row.createdAt).toLocaleString("vi-VN"),
        new Date(row.updatedAt).toLocaleString("vi-VN"),
        row.direction === "IN" ? "Thu" : "Chi",
        row.creator?.fullName ?? "-",
        row.teamUsers?.length ? row.teamUsers.map((user) => user.fullName).join(" | ") : "-",
        paymentAccountLabel,
        row.paymentAccount?.bankName ?? "-",
        row.paymentAccount?.accountNumber ?? "-",
        categoryDisplayName(row.category),
        row.description,
        amountOriginal.toString(),
        row.currencyCode,
        Number.isFinite(fx) ? fx.toString() : "-",
        amountVnd.toString(),
        row.purchaseRequestId ?? "-",
        String(row.notes?.length ?? 0),
        String(row.receiptImages?.length ?? 0),
        receiptNames || "-",
        (row.adjustmentCount ?? 0) > 0 ? "Co" : "Khong",
        String(row.adjustmentCount ?? 0),
        latestAdjustmentStatus,
        row.latestAdjustment?.requestedAt ? new Date(row.latestAdjustment.requestedAt).toLocaleString("vi-VN") : "-",
        latestAction,
        row.latestActivity?.createdAt ? new Date(row.latestActivity.createdAt).toLocaleString("vi-VN") : "-",
        String(row.timelineCount ?? 0),
      ];
      return values.map((value) => csvEscape(value)).join(",");
    });

    const csvContent = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const periodParam = searchParams.get("period");
    const qParam = searchParams.get("q")?.trim();
    const directionParam = searchParams.get("direction");
    const teamUserParam = searchParams.get("teamUserId");
    const categoryParam = searchParams.get("categoryId");
    const adjustedParam = searchParams.get("adjusted");
    const adjustmentStatusParam = searchParams.get("adjustmentStatus");
    const paymentAccountParam = searchParams.get("paymentAccountId");

    const filterParts: string[] = [];
    if (fromParam || toParam) {
      filterParts.push(`date-${fromParam ?? "all"}-${toParam ?? "all"}`);
    } else if (periodParam) {
      filterParts.push(`period-${toFilenameSlug(periodParam)}`);
    }
    if (directionParam === "IN" || directionParam === "OUT") {
      filterParts.push(`type-${directionParam === "IN" ? "thu" : "chi"}`);
    }
    if (teamUserParam && teamUserParam !== "__ALL__") {
      const teamLabel = teamUserParam === "__UNASSIGNED__" ? "chua-gan" : teamUserLabelById(teamUsers, teamUserParam);
      filterParts.push(`team-${toFilenameSlug(teamLabel)}`);
    }
    if (categoryParam && categoryParam !== "__ALL__") {
      filterParts.push(`cat-${toFilenameSlug(categoryLabelById(categories, categoryParam))}`);
    }
    if (adjustedParam === "YES" || adjustedParam === "NO") {
      filterParts.push(`adj-${adjustedParam === "YES" ? "co" : "khong"}`);
    }
    if (
      adjustmentStatusParam === "PENDING" ||
      adjustmentStatusParam === "APPROVED" ||
      adjustmentStatusParam === "REJECTED" ||
      adjustmentStatusParam === "__NONE__"
    ) {
      filterParts.push(`adjst-${toFilenameSlug(adjustmentStatusParam.toLowerCase())}`);
    }
    if (paymentAccountParam && paymentAccountParam !== "__ALL__") {
      const accountLabel =
        paymentAccountParam === "__NONE__" ? "khong-tai-khoan" : paymentAccountLabelById(paymentAccounts, paymentAccountParam);
      filterParts.push(`acc-${toFilenameSlug(accountLabel)}`);
    }
    if (qParam) {
      filterParts.push(`kw-${toFilenameSlug(qParam, 18)}`);
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(
      2,
      "0"
    )}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const suffix = filterParts.length ? filterParts.join("_") : "all";

    link.href = url;
    link.download = `so-giao-dich_${suffix}_${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất CSV (${filteredRows.length} giao dịch)`);
  }

  async function loadTimelineForTransaction(row: Transaction) {
    const cacheKey = getTimelineCacheKey(row);
    const cachedRows = timelineCache[cacheKey];
    if (cachedRows) {
      setTimelineRows(cachedRows);
      setOpeningDetailRowId((current) => (current === row.id ? null : current));
      return;
    }

    setTimelineLoading(true);
    setTimelineRows([]);
    try {
      const txPromise = fetch(
        `/api/logs?entityType=transaction&entityId=${encodeURIComponent(row.id)}&page=1&pageSize=100&order=desc`,
        { cache: "no-store" },
      );

      const requestPromise = row.purchaseRequestId
        ? fetch(
            `/api/logs?entityType=purchase_request&entityId=${encodeURIComponent(row.purchaseRequestId)}&page=1&pageSize=100&order=desc`,
            { cache: "no-store" },
          )
        : null;

      const [txRes, requestRes] = await Promise.all([txPromise, requestPromise]);
      const [txData, requestData] = await Promise.all([
        txRes.json().catch(() => ({})),
        requestRes ? requestRes.json().catch(() => ({})) : Promise.resolve({}),
      ]);

      if (!txRes.ok) {
        toast.error(txData.error ?? "Không tải được timeline giao dịch");
        return;
      }
      if (requestRes && !requestRes.ok) {
        toast.error(requestData.error ?? "Không tải được timeline yêu cầu mua");
        return;
      }

      const txRows = Array.isArray(txData.rows) ? (txData.rows as TimelineLog[]) : [];
      const requestRows = Array.isArray(requestData.rows) ? (requestData.rows as TimelineLog[]) : [];
      const mergedRows = [...txRows, ...requestRows].toSorted(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      setTimelineRows(mergedRows);
      setTimelineCache((prev) => ({ ...prev, [cacheKey]: mergedRows }));
    } finally {
      setTimelineLoading(false);
      setOpeningDetailRowId((current) => (current === row.id ? null : current));
    }
  }

  useEffect(() => {
    if (!detailModal) return;
    void loadTimelineForTransaction(detailModal);
  }, [detailModal]);

  async function submitNote() {
    if (!detailModal) return;
    const content = noteContent.trim();
    if (!content) {
      toast.error("Vui lòng nhập ghi chú");
      return;
    }

    setSavingNote(true);
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(detailModal.id)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json().catch(() => ({}))) as TransactionNotesResponse;
      if (!response.ok) {
        toast.error(data.error ?? "Không thêm được ghi chú");
        return;
      }

      const nextRows = Array.isArray(data.rows) ? data.rows : detailModal.notes ?? [];
      setDetailModal((prev) => (prev ? { ...prev, notes: nextRows } : prev));
      setRows((prev) =>
        prev.map((row) => (row.id === detailModal.id ? { ...row, notes: nextRows } : row))
      );
      setNoteContent("");
      toast.success("Đã thêm ghi chú");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Sổ giao dịch</CardTitle>
            {canCreateTransaction ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                Tạo giao dịch
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Kỳ lọc</Label>
                <Select
                  value={draftPeriod}
                  onValueChange={(value) => {
                    const next = value as QuickPeriodKey;
                    setDraftPeriod(next);
                    if (next === "CUSTOM") return;
                    const range = getQuickPeriodRange(next, new Date());
                    setDraftDateRange(range);
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Kỳ lọc nhanh" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUICK_PERIODS.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="CUSTOM">Tùy chỉnh</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Khoảng ngày</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-[250px] justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 size-4" />
                      {draftDateRange?.from
                        ? `${draftDateRange.from.toLocaleDateString("vi-VN")} - ${
                            draftDateRange.to ? draftDateRange.to.toLocaleDateString("vi-VN") : "..."
                          }`
                        : "Khoảng ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      numberOfMonths={2}
                      selected={draftDateRange}
                      onSelect={(range) => {
                        setDraftDateRange(range);
                        setDraftPeriod("CUSTOM");
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Từ khóa</Label>
                <Input
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder="Từ khóa"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nhân viên</Label>
                <Select value={draftTeamUserId} onValueChange={setDraftTeamUserId}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Nhan vien" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả nhân viên</SelectItem>
                    <SelectItem value="__UNASSIGNED__">Chưa gán nhân viên</SelectItem>
                    {teamUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Loại giao dịch</Label>
                <Select value={draftDirection} onValueChange={(value) => setDraftDirection(value as DirectionFilter)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Loại giao dịch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả loại</SelectItem>
                    <SelectItem value="IN">Thu</SelectItem>
                    <SelectItem value="OUT">Chi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Danh mục</Label>
                <Select value={draftCategoryId} onValueChange={setDraftCategoryId}>
                  <SelectTrigger className="w-[190px]">
                    <SelectValue placeholder="Danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả danh mục</SelectItem>
                    {filteredDraftCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {categoryDisplayName(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Có điều chỉnh</Label>
                <Select value={draftAdjusted} onValueChange={(value) => setDraftAdjusted(value as AdjustedFilter)}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Trạng thái điều chỉnh" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả</SelectItem>
                    <SelectItem value="YES">Có điều chỉnh</SelectItem>
                    <SelectItem value="NO">Chưa điều chỉnh</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Duyệt điều chỉnh</Label>
                <Select
                  value={draftAdjustmentStatus}
                  onValueChange={(value) => setDraftAdjustmentStatus(value as AdjustmentStatusFilter)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Duyệt điều chỉnh" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả duyệt</SelectItem>
                    <SelectItem value="PENDING">Chờ duyệt</SelectItem>
                    <SelectItem value="APPROVED">Đã duyệt</SelectItem>
                    <SelectItem value="REJECTED">Từ chối</SelectItem>
                    <SelectItem value="__NONE__">Chưa có điều chỉnh</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tài khoản thanh toán</Label>
                <Select value={draftPaymentAccountId} onValueChange={setDraftPaymentAccountId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Tài khoản thanh toán" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả tài khoản thanh toán</SelectItem>
                    <SelectItem value="__NONE__">Không có tài khoản</SelectItem>
                    {paymentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.accountName} - {account.bankName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="button" variant="secondary" onClick={exportCsv}>
                  Xuất CSV
                </Button>
                {hasActiveFilters ? (
                  <Button type="button" variant="ghost" onClick={clearFilters}>
                    Xóa bộ lọc
                  </Button>
                ) : null}
              </div>
            </div>
            {filterLoading ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Đang tải dữ liệu theo bộ lọc...
              </div>
            ) : null}
          </div>
          <div className="relative w-full rounded-lg border">
          {filterLoading ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/40">
              <div className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                <Loader2 className="size-3.5 animate-spin" />
                Đang lọc giao dịch...
              </div>
            </div>
          ) : null}
          <Table className={`w-max min-w-full ${filterLoading ? "opacity-60" : ""}`}>
            <TableHeader className="[&_tr]:bg-muted/50">
              <TableRow>
                <TableHead>STT</TableHead>
                <TableHead>
                  <Button type="button" variant="ghost" className="h-auto p-0" onClick={() => toggleSort("transactionDate")}>
                    Ngày
                    <ArrowUpDown className="ml-1 size-3.5" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button type="button" variant="ghost" className="h-auto p-0" onClick={() => toggleSort("amountOriginal")}>
                    Gốc
                    <ArrowUpDown className="ml-1 size-3.5" />
                  </Button>
                </TableHead>
                <TableHead>VND</TableHead>
                <TableHead>Người tạo</TableHead>
                <TableHead>User Team</TableHead>
                <TableHead>Tài Khoản</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="min-w-[360px]">Mô tả</TableHead>
                <TableHead>Cập nhật lần cuối</TableHead>
                <TableHead className="min-w-[170px]">Ảnh chứng từ</TableHead>
                <TableHead className="min-w-[220px] text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map((row, index) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => openDetailModal(row)}>
                  <TableCell>{(safePage - 1) * pageSize + index + 1}</TableCell>
                  <TableCell>{new Date(row.transactionDate).toLocaleString("vi-VN")}</TableCell>
                  <TableCell className={row.direction === "IN" ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                    {Number(row.amountOriginal).toLocaleString("vi-VN")} {row.currencyCode}
                  </TableCell>
                  <TableCell className={row.direction === "IN" ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>
                    {Number(row.amountVnd).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell>{row.creator?.fullName ?? "-"}</TableCell>
                  <TableCell>
                    {row.teamUsers?.length ? row.teamUsers.map((user) => user.fullName).join(", ") : "-"}
                  </TableCell>
                  <TableCell>
                    {row.paymentAccount
                      ? `${row.paymentAccount.accountName} - ${row.paymentAccount.bankName}`
                      : "-"}
                  </TableCell>
                  <TableCell>{categoryDisplayName(row.category)}</TableCell>
                  <TableCell className="min-w-[360px] whitespace-pre-line">{row.description}</TableCell>
                  <TableCell>{new Date(row.updatedAt).toLocaleString("vi-VN")}</TableCell>
                  <TableCell className="min-w-[170px]">
                    {(row.receiptImages?.length ?? 0) > 0 ? (
                      <div className="space-y-1">
                        <button
                          type="button"
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setReceiptModal({
                              title: row.description,
                              images: (row.receiptImages ?? []).map((item) => ({
                                id: item.id,
                                filePath: item.filePath,
                                fileName: item.fileName,
                              })),
                            });
                          }}
                        >
                          Xem ({row.receiptImages?.length ?? 0})
                        </button>
                        <div className="flex flex-wrap gap-1">
                          {(row.receiptImages ?? []).slice(0, 3).map((image) => (
                            <button
                              key={image.id}
                              type="button"
                              className="inline-flex"
                              onClick={(event) => {
                                event.stopPropagation();
                                setReceiptModal({
                                  title: row.description,
                                  images: (row.receiptImages ?? []).map((item) => ({
                                    id: item.id,
                                    filePath: item.filePath,
                                    fileName: item.fileName,
                                  })),
                                });
                              }}
                            >
                              <Image
                                src={image.filePath}
                                alt={image.fileName}
                                width={28}
                                height={28}
                                unoptimized
                                className="size-7 rounded border object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">0 ảnh</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="flex w-full flex-col items-end gap-1.5">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {roles.includes("ACCOUNTANT") || roles.includes("ADMIN") ? (
                          <div className="relative inline-flex">
                            <Button
                              type="button"
                              size="xs"
                              variant={row.latestAdjustment?.status === "APPROVED" ? "outline" : "secondary"}
                              className={
                                row.latestAdjustment?.status === "APPROVED"
                                  ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : undefined
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                void openAdjustModal(row);
                              }}
                              disabled={openingAdjustRowId === row.id || row.latestAdjustment?.status === "PENDING"}
                            >
                              {openingAdjustRowId === row.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <Loader2 className="size-3.5 animate-spin" />
                                  Đang mở...
                                </span>
                              ) : row.latestAdjustment?.status === "PENDING" ? (
                                "Chờ duyệt"
                              ) : (
                                "Điều chỉnh"
                              )}
                            </Button>
                            {(row.adjustmentCount ?? 0) > 0 ? (
                              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-4 text-white">
                                {row.adjustmentCount}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="relative inline-flex">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            title="Xem chi tiết giao dịch"
                            aria-label="Xem chi tiết giao dịch"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetailModal(row);
                            }}
                            disabled={openingDetailRowId === row.id}
                          >
                            {openingDetailRowId === row.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "Xem"
                            )}
                          </Button>
                          {(row.timelineCount ?? 0) > 0 ? (
                            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-slate-600 px-1 text-[10px] font-semibold leading-4 text-white">
                              {row.timelineCount}
                            </span>
                          ) : null}
                        </div>
                        {canDeleteTransaction ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteTransaction(row);
                            }}
                            disabled={deletingTransactionId === row.id}
                          >
                            {deletingTransactionId === row.id ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="size-3.5 animate-spin" />
                                Xóa...
                              </span>
                            ) : (
                              "Xóa"
                            )}
                          </Button>
                        ) : null}
                      </div>
                      {(() => {
                        if (row.latestAdjustment?.status !== "PENDING") return null;
                        const pendingAdjustment = pendingAdjustments.find(
                          (item) => item.transactionId === row.id && item.status === "PENDING"
                        );
                        if (!pendingAdjustment) {
                          return (
                            <Badge variant="outline" className="border-rose-300 bg-rose-100 text-rose-700">
                              Yêu cầu điều chỉnh chờ duyệt
                            </Badge>
                          );
                        }
                        return (
                          <button
                            type="button"
                            className="inline-flex"
                            onClick={(event) => {
                              event.stopPropagation();
                              setAdjustmentReviewModal(pendingAdjustment);
                            }}
                            title="Xem yêu cầu điều chỉnh"
                            aria-label="Xem yêu cầu điều chỉnh"
                          >
                            <Badge variant="outline" className="border-rose-300 bg-rose-100 text-rose-700">
                              Yêu cầu điều chỉnh chờ duyệt
                            </Badge>
                          </button>
                        );
                      })()}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!paginatedRows.length ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-sm text-muted-foreground">
                    Không có dữ liệu giao dịch.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={8} className="text-sm font-semibold">
                  Tổng theo bộ lọc hiện tại
                </TableCell>
                <TableCell className="text-xs">
                  <p className="text-emerald-700">Tổng thu</p>
                  <p className="text-rose-700">Tổng chi</p>
                </TableCell>
                <TableCell className="text-xs">
                  <p className="font-semibold text-emerald-700">
                    {filteredTotals.incomeVnd.toLocaleString("vi-VN")} VND
                  </p>
                  <p className="font-semibold text-rose-700">
                    {filteredTotals.expenseVnd.toLocaleString("vi-VN")} VND
                  </p>
                </TableCell>
                <TableCell colSpan={1} className="min-w-[170px]" />
                <TableCell colSpan={1} className="min-w-[220px]" />
              </TableRow>
            </TableFooter>
          </Table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Trang {safePage}/{totalPages} • Tổng {filteredRows.length} giao dịch
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => changePage(Math.max(1, safePage - 1))}
              >
                Trước
              </Button>
              {visiblePages.map((page, index) => {
                const prev = visiblePages[index - 1];
                const showGap = typeof prev === "number" && page - prev > 1;
                return (
                  <div key={page} className="flex items-center gap-2">
                    {showGap ? <span className="px-1 text-xs text-muted-foreground">...</span> : null}
                    <Button
                      type="button"
                      variant={page === safePage ? "default" : "outline"}
                      size="sm"
                      onClick={() => changePage(page)}
                      aria-current={page === safePage ? "page" : undefined}
                    >
                      {page}
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => changePage(Math.min(totalPages, safePage + 1))}
              >
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailModal)} onOpenChange={(open) => !open && setDetailModal(null)}>
        <DialogContent className="w-[96vw] max-w-[calc(100vw-2rem)] lg:max-w-[1300px]">
          <DialogHeader>
            <DialogTitle>Chi tiết giao dịch</DialogTitle>
          </DialogHeader>
          {detailModal ? (
            <div className="grid gap-4 lg:grid-cols-[1.05fr_1.35fr]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mô tả</Label>
                    <p className="whitespace-pre-line text-sm font-medium">{detailModal.description}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Loại</Label>
                    <div className="mt-1">
                      <Badge variant={detailModal.direction === "IN" ? "default" : "secondary"}>
                        {detailModal.direction === "IN" ? "Thu" : "Chi"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ngày giao dịch</Label>
                    <p className="text-sm">{new Date(detailModal.transactionDate).toLocaleString("vi-VN")}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Created at</Label>
                    <p className="text-sm">{new Date(detailModal.createdAt).toLocaleString("vi-VN")}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tài khoản thanh toán</Label>
                    <p className="text-sm">
                      {detailModal.paymentAccount
                        ? `${detailModal.paymentAccount.accountName} - ${detailModal.paymentAccount.bankName} (${detailModal.paymentAccount.accountNumber})`
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Số tiền gốc</Label>
                    <p className={detailModal.direction === "IN" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-rose-700"}>
                      {Number(detailModal.amountOriginal).toLocaleString("vi-VN")} {detailModal.currencyCode}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Số tiền VND</Label>
                    <p className={detailModal.direction === "IN" ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-rose-700"}>
                      {Number(detailModal.amountVnd).toLocaleString("vi-VN")} VND
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Ảnh chứng từ ({detailModal.receiptImages?.length ?? 0})</Label>
                    {(roles.includes("ACCOUNTANT") || roles.includes("ADMIN")) ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => setAddingReceiptFor({ id: detailModal.id, title: detailModal.description })}
                      >
                        Thêm ảnh chứng từ
                      </Button>
                    ) : null}
                  </div>
                  {detailModal.receiptImages?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {detailModal.receiptImages.map((image) => (
                        <div key={image.id} className="relative inline-flex">
                          <button
                            type="button"
                            className="inline-flex"
                            onClick={() => {
                              setReceiptModal({
                                title: detailModal.description,
                                images: detailModal.receiptImages!.map((item) => ({
                                  id: item.id,
                                  filePath: item.filePath,
                                  fileName: item.fileName,
                                })),
                              });
                            }}
                          >
                            <Image
                              src={image.filePath}
                              alt={image.fileName}
                              width={56}
                              height={56}
                              unoptimized
                              className="size-14 rounded-md border object-cover"
                            />
                          </button>
                          {canDeleteReceipt ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="destructive"
                              className="absolute -right-2 -top-2 h-6 px-2 text-xs"
                              disabled={deletingTransactionReceiptId === image.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteTransactionReceipt(detailModal.id, image.id);
                              }}
                            >
                              {deletingTransactionReceiptId === image.id ? "..." : "Xóa"}
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Chưa có ảnh chứng từ.</p>
                  )}
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <Label>Ghi chú ({detailModal.notes?.length ?? 0})</Label>
                  <div className="space-y-2">
                    <Textarea
                      value={noteContent}
                      onChange={(event) => setNoteContent(event.target.value)}
                      placeholder="Nhập ghi chú..."
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button type="button" size="sm" onClick={submitNote} disabled={savingNote}>
                        {savingNote ? "Đang lưu..." : "Thêm ghi chú"}
                      </Button>
                    </div>
                  </div>
                  {(detailModal.notes?.length ?? 0) > 0 ? (
                    <div className="max-h-[34vh] space-y-2 overflow-y-auto rounded-md border p-2">
                      {detailModal.notes!
                        .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((note) => (
                          <div key={note.id} className="rounded border p-2">
                            <p className="text-xs text-muted-foreground">
                              {note.authorName} - {new Date(note.createdAt).toLocaleString("vi-VN")}
                            </p>
                            <p className="text-sm">{note.content}</p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Chưa có ghi chú.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Timeline</Label>
                  {detailModal.latestActivity ? (
                    <p className="text-xs text-muted-foreground">
                      Cập nhật gần nhất: {new Date(detailModal.latestActivity.createdAt).toLocaleString("vi-VN")}
                    </p>
                  ) : null}
                </div>
                {timelineLoading ? <p className="text-sm text-muted-foreground">Đang tải timeline...</p> : null}
                {!timelineLoading && !timelineRows.length ? (
                  <p className="text-sm text-muted-foreground">Không có log cho giao dịch này.</p>
                ) : null}
                {!timelineLoading && timelineRows.length ? (
                  <div className="max-h-[70vh] overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Thời gian</TableHead>
                          <TableHead>Người dùng</TableHead>
                          <TableHead>Hành động</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {timelineRows.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{new Date(item.createdAt).toLocaleString("vi-VN")}</TableCell>
                            <TableCell>
                              <p className="font-medium">{item.actor?.fullName ?? "SYSTEM"}</p>
                              <p className="text-xs text-muted-foreground">{item.actorId ?? "-"}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={actionBadgeClass(item.action)}>
                                {mapActionLabel(item.action)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(adjustmentReviewModal)} onOpenChange={(open) => !open && setAdjustmentReviewModal(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết yêu cầu điều chỉnh</DialogTitle>
          </DialogHeader>
          {adjustmentReviewModal ? (
            <div className="space-y-4">
              {(() => {
                const before = adjustmentReviewModal.beforePayload ?? null;
                const after = adjustmentReviewModal.afterPayload ?? adjustmentReviewModal.payload;
                return (
                  <>
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {adjustmentReviewModal.transaction?.description ?? adjustmentReviewModal.transactionId}
                </p>
                <p className="text-xs text-muted-foreground">
                  Người yêu cầu: {adjustmentReviewModal.requester.fullName} -{" "}
                  {new Date(adjustmentReviewModal.requestedAt).toLocaleString("vi-VN")}
                </p>
                <p className="mt-2">
                  <span className="font-medium">Lý do điều chỉnh:</span> {adjustmentReviewModal.reason}
                </p>
              </div>

              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">So sánh điều chỉnh</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded border bg-muted/30 p-2">
                    <p className="text-xs font-semibold text-muted-foreground">Cũ</p>
                    <p className="mt-1 text-xs">
                      Số tiền:{" "}
                      {before ? `${Number(before.amountOriginal).toLocaleString("vi-VN")} ${before.currencyCode}` : "-"}
                    </p>
                    <p className="mt-1 text-xs">Loại GD: {directionLabel(before?.direction)}</p>
                    <p className="mt-1 text-xs">Danh mục: {categoryLabelById(categories, before?.categoryId)}</p>
                    <p className="mt-1 text-xs">Nhân viên: {teamUsersLabel(teamUsers, before)}</p>
                    <p className="mt-1 text-xs">
                      Tài khoản: {paymentAccountLabelById(paymentAccounts, before?.paymentAccountId)}
                    </p>
                    <p className="mt-1 text-xs">
                      Ngày GD: {before ? new Date(before.transactionDate).toLocaleString("vi-VN") : "-"}
                    </p>
                    <p className="mt-1 text-xs whitespace-pre-line">Mô tả: {before?.description ?? "-"}</p>
                  </div>
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                    <p className="text-xs font-semibold text-emerald-700">Mới</p>
                    <p className="mt-1 text-xs">
                      Số tiền: {Number(after.amountOriginal).toLocaleString("vi-VN")} {after.currencyCode}
                    </p>
                    <p className="mt-1 text-xs">Loại GD: {directionLabel(after.direction)}</p>
                    <p className="mt-1 text-xs">Danh mục: {categoryLabelById(categories, after.categoryId)}</p>
                    <p className="mt-1 text-xs">Nhân viên: {teamUsersLabel(teamUsers, after)}</p>
                    <p className="mt-1 text-xs">
                      Tài khoản: {paymentAccountLabelById(paymentAccounts, after.paymentAccountId)}
                    </p>
                    <p className="mt-1 text-xs">Ngày GD: {new Date(after.transactionDate).toLocaleString("vi-VN")}</p>
                    <p className="mt-1 text-xs whitespace-pre-line">Mô tả: {after.description}</p>
                  </div>
                </div>
              </div>
                  </>
                );
              })()}

              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" className="h-10 px-5" onClick={() => setAdjustmentReviewModal(null)}>
                  Đóng
                </Button>
                {roles.includes("ADMIN") ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-10 px-5"
                      variant="outline"
                      disabled={reviewingAdjustmentId === adjustmentReviewModal.id}
                      onClick={() => void reviewAdjustment(adjustmentReviewModal.id, "REJECT")}
                    >
                      {reviewingAdjustmentId === adjustmentReviewModal.id ? "Đang xử lý..." : "Từ chối"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-10 px-5"
                      disabled={reviewingAdjustmentId === adjustmentReviewModal.id}
                      onClick={() => void reviewAdjustment(adjustmentReviewModal.id, "APPROVE")}
                    >
                      {reviewingAdjustmentId === adjustmentReviewModal.id ? "Đang xử lý..." : "Duyệt"}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(adjustingRow)}
        onOpenChange={(open) => {
          if (!open) {
            setAdjustingRow(null);
            setAdjustReason("");
            setAdjustmentHistory([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Yêu cầu điều chỉnh giao dịch</DialogTitle>
          </DialogHeader>
          {adjustingRow ? (
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3">
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{adjustingRow.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(adjustingRow.transactionDate).toLocaleString("vi-VN")}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Nhân viên (không bắt buộc, có thể chọn nhiều)</Label>
                  <TeamUserMultiSelect
                    teamUsers={teamUsers}
                    selectedIds={adjustTeamUserIds}
                    onChange={setAdjustTeamUserIds}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Tài khoản thanh toán (không bắt buộc)</Label>
                  <Select
                    value={adjustPaymentAccountId || "__NONE__"}
                    onValueChange={(value) => setAdjustPaymentAccountId(value === "__NONE__" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Không chọn tài khoản" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">Không chọn tài khoản</SelectItem>
                      {paymentAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.accountName} - {account.bankName} ({account.accountNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Danh mục</Label>
                  <Select value={adjustCategoryId} onValueChange={setAdjustCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn danh mục" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {categoryDisplayName(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Số tiền</Label>
                  <Tabs value={adjustCurrencyCode} onValueChange={(value) => setAdjustCurrencyCode(value as "VND" | "USD")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="VND">VND</TabsTrigger>
                      <TabsTrigger value="USD">USD</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={adjustAmountInput}
                    onChange={(event) => setAdjustAmountInput(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Ngày giao dịch</Label>
                  <Input
                    type="datetime-local"
                    value={adjustTransactionDate}
                    onChange={(event) => setAdjustTransactionDate(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Mô tả</Label>
                  <Textarea value={adjustDescription} onChange={(event) => setAdjustDescription(event.target.value)} rows={3} />
                </div>
                <div className="grid gap-2">
                  <Label>Lý do điều chỉnh</Label>
                  <Textarea value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} rows={3} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAdjustingRow(null)}>
                    Hủy
                  </Button>
                  <Button type="button" disabled={sendingAdjustment} onClick={() => void submitAdjustmentRequest()}>
                    {sendingAdjustment ? "Đang gửi..." : "Gửi yêu cầu"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <Label>Lịch sử điều chỉnh</Label>
                {adjustmentHistoryLoading ? (
                  <p className="text-sm text-muted-foreground">Đang tải lịch sử...</p>
                ) : null}
                {!adjustmentHistoryLoading && !adjustmentHistory.length ? (
                  <p className="text-sm text-muted-foreground">Chưa có điều chỉnh nào cho giao dịch này.</p>
                ) : null}
                {!!adjustmentHistory.length ? (
                  <div className="max-h-[65vh] space-y-2 overflow-y-auto">
                    {adjustmentHistory.map((item) => {
                      const status = adjustmentStatusMeta(item.status);
                      const before = item.beforePayload ?? null;
                      const after = item.afterPayload ?? item.payload;
                      return (
                        <div key={item.id} className="rounded-md border p-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className={status.className}>
                              {status.label}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.requestedAt).toLocaleString("vi-VN")}
                            </p>
                          </div>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div className="rounded border bg-muted/30 p-2">
                              <p className="text-xs font-semibold text-muted-foreground">Cũ</p>
                              <p className="mt-1 text-xs">
                                Số tiền:{" "}
                                {before
                                  ? `${Number(before.amountOriginal).toLocaleString("vi-VN")} ${before.currencyCode}`
                                  : "-"}
                              </p>
                              <p className="mt-1 text-xs">Loại GD: {directionLabel(before?.direction)}</p>
                              <p className="mt-1 text-xs">Danh mục: {categoryLabelById(categories, before?.categoryId)}</p>
                              <p className="mt-1 text-xs">Nhân viên: {teamUsersLabel(teamUsers, before)}</p>
                              <p className="mt-1 text-xs">
                                Tài khoản: {paymentAccountLabelById(paymentAccounts, before?.paymentAccountId)}
                              </p>
                              <p className="mt-1 text-xs">
                                Ngày GD: {before ? new Date(before.transactionDate).toLocaleString("vi-VN") : "-"}
                              </p>
                              <p className="mt-1 text-xs whitespace-pre-line">Mô tả: {before?.description ?? "-"}</p>
                            </div>
                            <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                              <p className="text-xs font-semibold text-emerald-700">Mới</p>
                              <p className="mt-1 text-xs">
                                Số tiền: {Number(after.amountOriginal).toLocaleString("vi-VN")} {after.currencyCode}
                              </p>
                              <p className="mt-1 text-xs">Loại GD: {directionLabel(after.direction)}</p>
                              <p className="mt-1 text-xs">Danh mục: {categoryLabelById(categories, after.categoryId)}</p>
                              <p className="mt-1 text-xs">Nhân viên: {teamUsersLabel(teamUsers, after)}</p>
                              <p className="mt-1 text-xs">
                                Tài khoản: {paymentAccountLabelById(paymentAccounts, after.paymentAccountId)}
                              </p>
                              <p className="mt-1 text-xs">Ngày GD: {new Date(after.transactionDate).toLocaleString("vi-VN")}</p>
                              <p className="mt-1 text-xs whitespace-pre-line">Mô tả: {after.description}</p>
                            </div>
                          </div>
                          <p className="mt-2 text-xs whitespace-pre-line">Lý do: {item.reason}</p>
                          {item.reviewNote ? (
                            <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                              Ghi chú duyệt: {item.reviewNote}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Tạo giao dịch</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Nhân viên (không bắt buộc, có thể chọn nhiều)</Label>
              <TeamUserMultiSelect
                teamUsers={teamUsers}
                selectedIds={createTeamUserIds}
                onChange={setCreateTeamUserIds}
                disabled={creating}
              />
            </div>

            <div className="grid gap-2">
              <Label>Tài khoản thanh toán (không bắt buộc)</Label>
              <Select
                value={createPaymentAccountId || "__NONE__"}
                onValueChange={(value) => setCreatePaymentAccountId(value === "__NONE__" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Không chọn tài khoản" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">Không chọn tài khoản</SelectItem>
                  {paymentAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.accountName} - {account.bankName} ({account.accountNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Loại giao dịch</Label>
              <Select
                value={createDirection}
                onValueChange={(value) => setCreateDirection(value as CreateDirection)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại giao dịch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUT">Chi</SelectItem>
                  <SelectItem value="IN">Thu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Danh mục</Label>
              <Button
                type="button"
                variant="outline"
                className="justify-start text-left font-normal"
                disabled={!filteredCreateCategories.length}
                onClick={() => setCreateCategoryPickerOpen(true)}
              >
                {selectedCreateCategory ? categoryDisplayName(selectedCreateCategory) : "Chọn danh mục"}
              </Button>
              {!filteredCreateCategories.length ? (
                <p className="text-xs text-muted-foreground">
                  Không có danh mục cho loại {createDirection === "IN" ? "Thu" : "Chi"}.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Số tiền gốc</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={createAmountInput}
                  onChange={(event) => setCreateAmountInput(event.target.value)}
                  placeholder="Nhập số tiền"
                />
                <p className="text-xs text-muted-foreground">
                  {createAmountInWords ? `Bằng chữ: ${createAmountInWords}` : "Nhập số tiền để hiển thị bằng chữ."}
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Tiền tệ</Label>
                <Select
                  value={createCurrencyCode}
                  onValueChange={(value: "VND" | "USD") => setCreateCurrencyCode(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn tiền tệ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VND">VND</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Mô tả</Label>
              <Input
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Nhập mô tả giao dịch"
              />
            </div>

            <div className="grid gap-2">
              <Label>Ngày giao dịch</Label>
              <Input
                type="datetime-local"
                value={createTransactionDate}
                onChange={(event) => setCreateTransactionDate(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Ảnh chứng từ</Label>
              <ReceiptImageUploader
                files={createReceiptFiles}
                onFilesChange={setCreateReceiptFiles}
                disabled={creating}
                chooseButtonLabel="Chọn ảnh chứng từ"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Hủy
              </Button>
              <Button type="button" onClick={createTransaction} disabled={creating}>
                {creating ? "Đang tạo..." : "Tạo giao dịch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createCategoryPickerOpen} onOpenChange={setCreateCategoryPickerOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Chọn danh mục</DialogTitle>
          </DialogHeader>
          {!filteredCreateCategories.length ? (
            <p className="text-sm text-muted-foreground">
              Không có danh mục cho loại {createDirection === "IN" ? "Thu" : "Chi"}.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y rounded-md border">
              {createCategoryGroups.parents.map((parent) => {
                const children = createCategoryGroups.childrenByParentId.get(parent.id) ?? [];
                const expanded = expandedCreateCategoryParents.includes(parent.id);
                const selectedParent = parent.id === createCategoryId;
                return (
                  <li key={parent.id} className="py-1">
                    <div className="flex items-center gap-1 px-2">
                      <button
                        type="button"
                        className={`flex-1 rounded px-2 py-1.5 text-left text-sm transition ${
                          selectedParent ? "font-semibold text-primary" : "hover:bg-muted"
                        }`}
                        onClick={() => {
                          setCreateCategoryId(parent.id);
                          setCreateCategoryPickerOpen(false);
                        }}
                      >
                        {categoryDisplayName(parent)}
                      </button>
                      {children.length > 0 ? (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Mở danh mục con"
                          onClick={() =>
                            setExpandedCreateCategoryParents((prev) =>
                              prev.includes(parent.id) ? prev.filter((id) => id !== parent.id) : [...prev, parent.id]
                            )
                          }
                        >
                          <ChevronRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                        </Button>
                      ) : null}
                    </div>
                    {children.length > 0 && expanded ? (
                      <ul className="mt-1 space-y-0.5 pl-8 pr-2">
                        {children.map((child) => {
                          const selectedChild = child.id === createCategoryId;
                          return (
                            <li key={child.id}>
                              <button
                                type="button"
                                className={`w-full rounded px-2 py-1 text-left text-sm transition ${
                                  selectedChild ? "font-semibold text-primary" : "hover:bg-muted"
                                }`}
                                onClick={() => {
                                  setCreateCategoryId(child.id);
                                  setCreateCategoryPickerOpen(false);
                                }}
                              >
                                {categoryDisplayName(child)}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setCreateCategoryPickerOpen(false)}>
              Đóng
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(addingReceiptFor)}
        onOpenChange={(open) => {
          if (!open) {
            setAddingReceiptFor(null);
            setAddReceiptFiles([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Thêm ảnh chứng từ</DialogTitle>
          </DialogHeader>
          {addingReceiptFor ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{addingReceiptFor.title}</p>
              <div className="grid gap-2">
                <Label>Chọn ảnh</Label>
                <ReceiptImageUploader
                  files={addReceiptFiles}
                  onFilesChange={setAddReceiptFiles}
                  disabled={addingReceipt}
                  chooseButtonLabel="Chọn ảnh chứng từ"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={addingReceipt}
                  onClick={() => {
                    setAddingReceiptFor(null);
                    setAddReceiptFiles([]);
                  }}
                >
                  Hủy
                </Button>
                <Button type="button" disabled={addingReceipt} onClick={submitAddReceipts}>
                  {addingReceipt ? "Đang tải..." : "Lưu ảnh chứng từ"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(receiptModal)} onOpenChange={(open) => !open && setReceiptModal(null)}>
        <DialogContent className="w-[96vw] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] xl:max-w-[1500px]">
          <DialogHeader>
            <DialogTitle>Danh sách ảnh chứng từ</DialogTitle>
          </DialogHeader>
          {receiptModal ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{receiptModal.title}</p>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {receiptModal.images.map((image) => (
                  <a
                    key={image.id}
                    href={image.filePath}
                    target="_blank"
                    rel="noreferrer"
                    className="space-y-3 rounded-md border p-3"
                  >
                    <div
                      className={`relative w-full overflow-hidden rounded-md bg-muted/20 ${
                        receiptModal.images.length === 1 ? "h-[68vh]" : "h-[46vh]"
                      }`}
                    >
                      <Image
                        src={image.filePath}
                        alt={image.fileName}
                        fill
                        unoptimized
                        quality={100}
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        className="object-contain bg-muted/20"
                      />
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{image.fileName}</p>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
