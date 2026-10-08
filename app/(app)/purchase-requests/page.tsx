"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertCircle, BookOpen, CalendarIcon, Clock3, HelpCircle, RefreshCcw } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyConversionDialog } from "@/components/app/currency-conversion-dialog";
import { ReceiptImageUploader } from "@/components/app/receipt-image-uploader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { snapshotFiles } from "@/lib/snapshot-file";
import { TagInput } from "@/components/app/tag-input";
import { usePurchaseRequestTour, type TourAudience } from "@/components/app/purchase-request-tour";
import { CategoryPickerTree } from "@/components/app/category-picker-tree";
import { buildCategoryTree, collectSelectableCategories } from "@/lib/category-tree";
import { DIEU_AM_ROLE_CODE } from "@/lib/dieu-am-scope";

type PurchaseRequestItem = {
  id: string;
  itemName: string;
  qty: string;
  unitPrice: string;
  subtotal: string;
};

type PurchaseRequestRow = {
  id: string;
  createdAt: string;
  title: string;
  description: string;
  category?: { id: string; name: string; accountantApprovalThresholdVnd: number | null } | null;
  approvals?: Array<{
    id: string;
    action: "APPROVE" | "REJECT";
    note: string;
    actor: { fullName: string };
    actedAt: string;
  }>;
  transactions?: Array<{
    id: string;
    createdAt: string;
    amountOriginal: string;
    currencyCode: "VND" | "USD";
    description?: string;
    notes?: unknown;
    transactionRef?: string | null;
    creator: { fullName: string };
  }>;
  receiptImages?: Array<{ id: string; filePath: string; fileName: string; createdAt: string }>;
  expectedAmount: string;
  currencyCode: "VND" | "USD";
  tags?: string[];
  workshopEmail?: string | null;
  walletOwnerName?: string | null;
  status: string;
  kind: "PURCHASE" | "COLLECTION";
  currencyConversionCount?: number;
  currencyConversionStatus?: "PENDING" | "FAILED" | "SUCCEEDED" | null;
  requester: { id: string; fullName: string; email: string };
  items: PurchaseRequestItem[];
};

type PurchaseRequestStatusFilter =
  | "__ALL__"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "PAID"
  | "CANCELLED";

type Category = {
  id: string;
  name: string;
  note?: string | null;
  contactEmail?: string | null;
  type: "INCOME" | "EXPENSE";
  parentId?: string | null;
  parentName?: string | null;
  level?: number;
  pathLabel?: string;
};

type PaymentAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ownerName: string;
};

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
};

type TimelineLog = {
  id: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  action: string;
  createdAt: string;
  actor?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

function categoryDisplayName(category: Pick<Category, "name" | "parentName"> & { pathLabel?: string }) {
  if (category.pathLabel) return category.pathLabel;
  return category.parentName ? `${category.parentName} / ${category.name}` : category.name;
}

const VN_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const SPECIAL_DELETE_EMAIL = "ngobao@bugmedia.vn";

const DEMO_REQUESTER = { id: "demo-user", fullName: "Team HKT (mẫu)", email: "demo@company.local" };

/** Phiếu mẫu chỉ hiện trong lúc chạy hướng dẫn, không đụng tới dữ liệu thật. */
const TOUR_DEMO_ROWS: PurchaseRequestRow[] = [
  {
    id: "demo-pending",
    createdAt: new Date().toISOString(),
    title: "Gia hạn ChatGPT Plus (phiếu mẫu)",
    description: "Tài khoản dothiymy@gmail.com",
    category: { id: "demo-cat", name: "Feline / Chi phí vận hành / Phần mềm + tool + hệ thống", accountantApprovalThresholdVnd: 5_000_000 },
    expectedAmount: "522500",
    currencyCode: "VND",
    status: "PENDING_APPROVAL",
    kind: "PURCHASE",
    requester: DEMO_REQUESTER,
    items: [],
  },
  {
    id: "demo-approved",
    createdAt: new Date().toISOString(),
    title: "Top up xưởng HGT (phiếu mẫu)",
    description: "ff HGT - ngoxuantung26497@gmail.com",
    category: { id: "demo-cat-2", name: "Feline / Xưởng / HGT", accountantApprovalThresholdVnd: 5_000_000 },
    expectedAmount: "800",
    currencyCode: "USD",
    status: "APPROVED",
    kind: "PURCHASE",
    requester: DEMO_REQUESTER,
    items: [],
  },
];

/** Quy trình làm việc viết ngoài hệ thống, mở theo đúng vai trò của người đang xem. */
const ROLE_DOC_LINKS: Partial<Record<TourAudience, { label: string; href: string; hint: string }>> = {
  ACCOUNTANT: {
    label: "Quy định kế toán",
    href: "https://docs.google.com/document/d/1N0sieZ6U9OTwlAP39MY3B9GgrLKMPQo9w4h5b5xnY54/edit?usp=sharing",
    hint: "Quy định khi làm việc với Kế Toán",
  },
  ACCOUNT: {
    label: "Quy định Account",
    href: "https://docs.google.com/document/d/1kGcMMApIK5wdjo6OyK34taro6r1s521RzqSu8mojpLI/edit?tab=t.0",
    hint: "Quy định khi làm việc với team Account",
  },
};

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

function normalizeSearchNumber(value: string) {
  return value.replace(/[,.\\s]/g, "");
}

function statusUi(status: string) {
  if (status === "PAID") return { label: "Đã thanh toán", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "APPROVED") return { label: "Đã duyệt", className: "bg-blue-100 text-blue-700 border-blue-200" };
  if (status === "PENDING_APPROVAL") return { label: "Chờ duyệt", className: "bg-amber-100 text-amber-700 border-amber-200" };
  if (status === "REJECTED") return { label: "Từ chối", className: "bg-rose-100 text-rose-700 border-rose-200" };
  if (status === "CANCELLED") return { label: "Đã hủy", className: "bg-slate-100 text-slate-700 border-slate-200" };
  return { label: "Nháp", className: "bg-slate-100 text-slate-700 border-slate-200" };
}

function currencyConversionStatusUi(status: PurchaseRequestRow["currencyConversionStatus"]) {
  if (status === "SUCCEEDED") {
    return { label: "Quy đổi: Thành công", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (status === "FAILED") {
    return { label: "Quy đổi: Thất bại", className: "border-rose-200 bg-rose-100 text-rose-700" };
  }
  if (status === "PENDING") {
    return { label: "Quy đổi: Đang chờ", className: "border-amber-200 bg-amber-100 text-amber-700" };
  }
  return null;
}

function mapActionLabel(action: string) {
  const labels: Record<string, string> = {
    "purchase_request.create": "Tạo yêu cầu mua",
    "purchase_request.submit": "Gửi duyệt yêu cầu mua",
    "purchase_request.approve": "Phê duyệt yêu cầu mua",
    "purchase_request.reject": "Từ chối yêu cầu mua",
    "purchase_request.pay": "Xác nhận chuyển tiền",
    "receipt_image.create": "Tải ảnh chứng từ",
    "receipt_image.delete": "Xóa ảnh chứng từ",
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
  if (action.includes("approve") || action.includes("pay")) {
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function getTransferNote(
  transaction:
    | Pick<NonNullable<PurchaseRequestRow["transactions"]>[number], "notes" | "description" | "transactionRef">
    | undefined
) {
  if (!transaction) return "";
  // transactionRef is the column the transaction ledger edits, so it wins over the legacy note blob.
  if (typeof transaction.transactionRef === "string" && transaction.transactionRef.trim()) {
    return transaction.transactionRef.trim();
  }
  if (transaction.notes && typeof transaction.notes === "object" && !Array.isArray(transaction.notes)) {
    const noteRecord = transaction.notes as Record<string, unknown>;
    const noteByPriority = [noteRecord.paymentTransferNote, noteRecord.paymentNote, noteRecord.transferNote].find(
      (value) => typeof value === "string" && value.trim()
    );
    if (typeof noteByPriority === "string") return noteByPriority.trim();
  }

  const description = transaction.description ?? "";
  const noteLine = description
    .split("\n")
    .find((line) => line.trim().toLowerCase().startsWith("ghi chú người thanh toán:"));
  if (!noteLine) return "";
  return noteLine.replace(/^ghi chú người thanh toán:\s*/i, "").trim();
}

async function readResponseJsonSafe<T = Record<string, unknown>>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export default function PurchaseRequestsPage() {
  const [rows, setRows] = useState<PurchaseRequestRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [tourDemoActive, setTourDemoActive] = useState(false);
  const [createRequesterId, setCreateRequesterId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currencyCode, setCurrencyCode] = useState<"USD" | "VND">("USD");
  const [categoryType, setCategoryType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [categoryId, setCategoryId] = useState("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [expectedAmountInput, setExpectedAmountInput] = useState("120");
  const [confirmingRow, setConfirmingRow] = useState<PurchaseRequestRow | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentCurrencyCode, setPaymentCurrencyCode] = useState<"USD" | "VND">("USD");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentCategoryId, setPaymentCategoryId] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [managingReceiptsId, setManagingReceiptsId] = useState<string | null>(null);
  const [manageReceiptFiles, setManageReceiptFiles] = useState<File[]>([]);
  const [manageReceiptPreviews, setManageReceiptPreviews] = useState<Array<{ url: string; name: string }>>([]);
  const [savingReceipts, setSavingReceipts] = useState(false);
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);
  const [accountantApprovalThresholdVnd, setAccountantApprovalThresholdVnd] = useState(5_000_000);
  const [defaultApprovalThresholdVnd, setDefaultApprovalThresholdVnd] = useState(5_000_000);
  const [currentPage, setCurrentPage] = useState(1);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>();
  const [draftSearch, setDraftSearch] = useState("");
  const [draftRequesterId, setDraftRequesterId] = useState("__ALL__");
  const [draftCategoryFilterId, setDraftCategoryFilterId] = useState("__ALL__");
  const [draftStatusFilter, setDraftStatusFilter] = useState<PurchaseRequestStatusFilter>("__ALL__");
  const [draftKindFilter, setDraftKindFilter] = useState<"__ALL__" | "PURCHASE" | "COLLECTION">("__ALL__");
  const [appliedDateRange, setAppliedDateRange] = useState<DateRange | undefined>();
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedRequesterId, setAppliedRequesterId] = useState("__ALL__");
  const [appliedCategoryFilterId, setAppliedCategoryFilterId] = useState("__ALL__");
  const [appliedStatusFilter, setAppliedStatusFilter] = useState<PurchaseRequestStatusFilter>("__ALL__");
  const [appliedKindFilter, setAppliedKindFilter] = useState<"__ALL__" | "PURCHASE" | "COLLECTION">("__ALL__");
  const [timelineRow, setTimelineRow] = useState<PurchaseRequestRow | null>(null);
  const [timelineRows, setTimelineRows] = useState<TimelineLog[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineCache, setTimelineCache] = useState<Record<string, TimelineLog[]>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createKind, setCreateKind] = useState<"PURCHASE" | "COLLECTION">("PURCHASE");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [createRequestReceiptFiles, setCreateRequestReceiptFiles] = useState<File[]>([]);
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [createWorkshopEmail, setCreateWorkshopEmail] = useState("");
  const [accountOptions, setAccountOptions] = useState<TeamUser[]>([]);
  const [createIsWalletStock, setCreateIsWalletStock] = useState(false);
  const [createWalletOwnerId, setCreateWalletOwnerId] = useState("");
  const [actionLoading, setActionLoading] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  const [pendingReviewAnchorId, setPendingReviewAnchorId] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const pageSize = 10;
  const expectedAmountValue = Number(expectedAmountInput);
  const amountInWords =
    Number.isFinite(expectedAmountValue) && expectedAmountValue >= 0
      ? amountToWords(expectedAmountValue, currencyCode)
      : "";
  const managingReceiptsRow = managingReceiptsId ? rows.find((row) => row.id === managingReceiptsId) ?? null : null;
  const requesterOptions = useMemo(() => {
    const map = new Map<string, { id: string; fullName: string; email: string }>();
    rows.forEach((row) => {
      if (!map.has(row.requester.id)) {
        map.set(row.requester.id, row.requester);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
  }, [rows]);
  const filteredRows = useMemo(() => {
    const matchedRows = rows.filter((row) => {
      const createdAt = new Date(row.createdAt);
      if (Number.isNaN(createdAt.getTime())) return false;

      if (appliedDateRange?.from) {
        const from = new Date(appliedDateRange.from);
        from.setHours(0, 0, 0, 0);
        if (createdAt.getTime() < from.getTime()) return false;
      }
      if (appliedDateRange?.to) {
        const to = new Date(appliedDateRange.to);
        to.setHours(23, 59, 59, 999);
        if (createdAt.getTime() > to.getTime()) return false;
      }
      if (appliedRequesterId !== "__ALL__" && row.requester.id !== appliedRequesterId) {
        return false;
      }
      if (appliedCategoryFilterId !== "__ALL__" && row.category?.id !== appliedCategoryFilterId) {
        return false;
      }
      if (appliedStatusFilter !== "__ALL__" && row.status !== appliedStatusFilter) {
        return false;
      }
      if (appliedKindFilter !== "__ALL__" && row.kind !== appliedKindFilter) {
        return false;
      }
      if (appliedSearch.trim()) {
        const textKeyword = appliedSearch.trim().toLowerCase();
        const byText =
          row.title.toLowerCase().includes(textKeyword) ||
          row.description.toLowerCase().includes(textKeyword) ||
          row.requester.fullName.toLowerCase().includes(textKeyword) ||
          row.requester.email.toLowerCase().includes(textKeyword) ||
          categoryDisplayName(row.category ?? { name: "", parentName: null }).toLowerCase().includes(textKeyword) ||
          (row.tags ?? []).some((tag) => tag.toLowerCase().includes(textKeyword)) ||
          row.status.toLowerCase().includes(textKeyword);
        const keywordNumber = normalizeSearchNumber(appliedSearch);
        const amountString = Number(row.expectedAmount).toLocaleString("vi-VN");
        const byAmount = keywordNumber ? normalizeSearchNumber(amountString).includes(keywordNumber) : false;
        if (!byText && !byAmount) return false;
      }
      return true;
    });
    return matchedRows.toSorted((a, b) => {
      const aPending = a.status === "PENDING_APPROVAL";
      const bPending = b.status === "PENDING_APPROVAL";
      if (aPending !== bPending) {
        return aPending ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [rows, appliedDateRange, appliedSearch, appliedRequesterId, appliedCategoryFilterId, appliedStatusFilter, appliedKindFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const categoryTree = useMemo(() => buildCategoryTree(categories, categoryType), [categories, categoryType]);
  const filteredCategories = useMemo(() => collectSelectableCategories(categoryTree), [categoryTree]);
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safeCurrentPage]);
  const selectedCreateCategory = filteredCategories.find((category) => category.id === categoryId) ?? null;
  // Picking a workshop pre-fills its email; the user can still correct it before saving.
  useEffect(() => {
    setCreateWorkshopEmail(selectedCreateCategory?.contactEmail ?? "");
  }, [selectedCreateCategory]);
  const paymentCategoryOptions = useMemo(
    () =>
      collectSelectableCategories(
        buildCategoryTree(categories, confirmingRow?.kind === "COLLECTION" ? "INCOME" : "EXPENSE")
      ),
    [categories, confirmingRow]
  );
  const selectedPaymentCategory = paymentCategoryOptions.find((category) => category.id === paymentCategoryId) ?? null;
  const canDeletePurchaseRequest = currentUserEmail === SPECIAL_DELETE_EMAIL;
  const canSelectRequester = roles.includes("ACCOUNTANT");
  const canCreateRequest = !roles.includes(DIEU_AM_ROLE_CODE);
  // Wallet stock is strictly self-service: only an Account member, creating their own
  // request, can mark it. Someone raising a request on another person's behalf never sees it.
  const isAccountRequester = roles.includes("ACCOUNT") && !createRequesterId;
  const conversionCandidateRows = useMemo(
    () =>
      rows
        .filter((row) => row.kind === "PURCHASE" && row.status === "APPROVED" && !row.currencyConversionCount)
        .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [rows]
  );

  useEffect(() => {
    if (!categoryId) return;
    const hasSelected = filteredCategories.some((category) => category.id === categoryId);
    if (!hasSelected) {
      setCategoryId("");
    }
  }, [filteredCategories, categoryId]);

  useEffect(() => {
    if (!pendingReviewAnchorId) return;
    const anchorIndex = filteredRows.findIndex((row) => row.id === pendingReviewAnchorId);
    if (anchorIndex >= 0) {
      const targetPage = Math.floor(anchorIndex / pageSize) + 1;
      setCurrentPage(targetPage);
    }
    setPendingReviewAnchorId(null);
  }, [pendingReviewAnchorId, filteredRows]);

  function applyFilters() {
    setAppliedDateRange(draftDateRange);
    setAppliedSearch(draftSearch.trim());
    setAppliedRequesterId(draftRequesterId);
    setAppliedCategoryFilterId(draftCategoryFilterId);
    setAppliedStatusFilter(draftStatusFilter);
    setAppliedKindFilter(draftKindFilter);
    setCurrentPage(1);
  }

  function clearFilters() {
    setDraftDateRange(undefined);
    setDraftSearch("");
    setDraftRequesterId("__ALL__");
    setDraftCategoryFilterId("__ALL__");
    setDraftStatusFilter("__ALL__");
    setDraftKindFilter("__ALL__");
    setAppliedDateRange(undefined);
    setAppliedSearch("");
    setAppliedRequesterId("__ALL__");
    setAppliedCategoryFilterId("__ALL__");
    setAppliedStatusFilter("__ALL__");
    setAppliedKindFilter("__ALL__");
    setCurrentPage(1);
  }

  function openCreateModal(kind: "PURCHASE" | "COLLECTION") {
    setCreateKind(kind);
    setCategoryType(kind === "COLLECTION" ? "INCOME" : "EXPENSE");
    setCategoryId("");
    setCreateIsWalletStock(false);
    setCreateModalOpen(true);
  }

  // Each role gets the walkthrough for the part of this screen it actually uses.
  const tourAudience: TourAudience | null = roles.includes("ACCOUNTANT")
    ? "ACCOUNTANT"
    : roles.includes("EMPLOYEE")
      ? "FELINE"
      : roles.includes("ACCOUNT")
        ? "ACCOUNT"
        : roles.includes("WORKSHOP")
          ? "WORKSHOP"
          : null;
  const showTour = tourAudience !== null;
  const roleDocLink = tourAudience ? ROLE_DOC_LINKS[tourAudience] : undefined;
  const [tourMenuOpen, setTourMenuOpen] = useState(false);
  const { startTour, isTourActive: tourActive, chapters: tourChapters } = usePurchaseRequestTour({
    audience: tourAudience ?? "FELINE",
    userId: showTour ? currentUserId : "",
    // The buy-back field only renders when there is at least one Account member to pick.
    showAccountWalletStep: roles.includes("EMPLOYEE") && accountOptions.length > 0,
    canConvertCurrency: roles.includes("ACCOUNTANT") || roles.includes("ADMIN"),
    openCreateDialog: (kind) => openCreateModal(kind ?? "PURCHASE"),
    closeCreateDialog: () => setCreateModalOpen(false),
    openCategoryPicker: () => setCategoryPickerOpen(true),
    closeCategoryPicker: () => setCategoryPickerOpen(false),
    startDemoData: () => setTourDemoActive(true),
    stopDemoData: () => setTourDemoActive(false),
    openPayDialog: () => {
      const demoRow = TOUR_DEMO_ROWS.find((row) => row.status === "APPROVED") ?? null;
      if (!demoRow) return;
      setConfirmingRow(demoRow);
      setPaymentAmountInput(String(Number(demoRow.expectedAmount)));
      setPaymentCurrencyCode(demoRow.currencyCode);
      setPaymentCategoryId("");
      setPaymentAccountId("");
      setPaymentNote("");
      setReceiptFiles([]);
      void loadPaymentAccounts();
    },
    closePayDialog: () => setConfirmingRow(null),
    openConversionDialog: () => {
      setConversionModalOpen(true);
      void loadPaymentAccounts();
    },
    closeConversionDialog: () => setConversionModalOpen(false),
    onFirstVisit: () => setTourMenuOpen(true),
  });

  async function loadRows() {
    const [requestResponse, categoryResponse] = await Promise.all([
      fetch("/api/purchase-requests", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" }),
    ]);

    const [requestData, categoryData] = await Promise.all([
      readResponseJsonSafe<{ error?: string; rows?: PurchaseRequestRow[] }>(requestResponse),
      readResponseJsonSafe<{ error?: string; rows?: Category[] }>(categoryResponse),
    ]);

    if (!requestResponse.ok) {
      toast.error(requestData.error ?? "Không tải được danh sách");
      return;
    }

    if (!categoryResponse.ok) {
      toast.error(categoryData.error ?? "Không tải được danh mục");
      return;
    }

    setRows(requestData.rows ?? []);
    setCategories(categoryData.rows ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/purchase-requests", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" }),
      fetch("/api/users/team-options", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" }),
      fetch("/api/settings/approval-threshold", { cache: "no-store" }),
    ])
      .then(async ([requestResponse, categoryResponse, teamUsersResponse, meResponse, thresholdResponse]) => {
        const [requestData, categoryData, teamUsersData, meData, thresholdData] = await Promise.all([
          readResponseJsonSafe<{ error?: string; rows?: PurchaseRequestRow[] }>(requestResponse),
          readResponseJsonSafe<{ error?: string; rows?: Category[] }>(categoryResponse),
          readResponseJsonSafe<{ error?: string; rows?: TeamUser[] }>(teamUsersResponse),
          readResponseJsonSafe<{ user?: { id?: string; email?: string; roles?: string[] } }>(meResponse),
          readResponseJsonSafe<{
            accountantApprovalThresholdVnd?: number;
            defaultAccountantApprovalThresholdVnd?: number;
          }>(thresholdResponse),
        ]);
        return {
          requestResponse,
          requestData,
          categoryResponse,
          categoryData,
          teamUsersResponse,
          teamUsersData,
          meResponse,
          meData,
          thresholdResponse,
          thresholdData,
        };
      })
      .then(({
        requestResponse,
        requestData,
        categoryResponse,
        categoryData,
        teamUsersResponse,
        teamUsersData,
        meResponse,
        meData,
        thresholdResponse,
        thresholdData,
      }) => {
        if (cancelled) return;
        if (!requestResponse.ok) {
          toast.error(requestData.error ?? "Không tải được danh sách");
          return;
        }
        if (!categoryResponse.ok) {
          toast.error(categoryData.error ?? "Không tải được danh mục");
          return;
        }
        setRows(requestData.rows ?? []);
        setCategories(categoryData.rows ?? []);
        if (teamUsersResponse.ok) {
          setTeamUsers(Array.isArray(teamUsersData.rows) ? teamUsersData.rows : []);
        }
        if (meResponse.ok) {
          setRoles(Array.isArray(meData.user?.roles) ? meData.user.roles : []);
          setCurrentUserEmail(String(meData.user?.email ?? "").toLowerCase());
          setCurrentUserId(String(meData.user?.id ?? ""));
        }
        void fetch("/api/users/account-options", { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            if (data?.rows) setAccountOptions(data.rows as TeamUser[]);
          });
        if (thresholdResponse.ok) {
          const threshold =
            typeof thresholdData.accountantApprovalThresholdVnd === "number"
              ? thresholdData.accountantApprovalThresholdVnd
              : 5_000_000;
          const defaultThreshold =
            typeof thresholdData.defaultAccountantApprovalThresholdVnd === "number"
              ? thresholdData.defaultAccountantApprovalThresholdVnd
              : 5_000_000;
          setAccountantApprovalThresholdVnd(threshold);
          setDefaultApprovalThresholdVnd(defaultThreshold);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createRequest() {
    if (title.trim().length < 3) {
      toast.error("Tiêu đề phải có ít nhất 3 ký tự");
      return;
    }
    if (description.trim().length < 3) {
      toast.error("Mô tả phải có ít nhất 3 ký tự");
      return;
    }
    if (!selectedCreateCategory) {
      toast.error("Vui lòng chọn danh mục cấp 3");
      return;
    }
    if (selectedCreateCategory.level !== 3) {
      toast.error("Vui lòng chọn đúng danh mục cấp 3");
      return;
    }
    if (!Number.isFinite(expectedAmountValue) || expectedAmountValue <= 0) {
      toast.error("Số tiền đề xuất phải lớn hơn 0");
      return;
    }

    setCreatingRequest(true);
    try {
      const formData = new FormData();
      formData.set("kind", createKind);
      formData.set("title", title.trim());
      formData.set("description", description.trim());
      formData.set("categoryId", categoryId);
      formData.set("expectedAmount", String(expectedAmountValue));
      formData.set("currencyCode", currencyCode);
      if (createRequesterId) {
        formData.set("requesterId", createRequesterId);
      }
      createTags.forEach((tag) => formData.append("tags", tag));
      if (createWorkshopEmail.trim()) {
        formData.set("workshopEmail", createWorkshopEmail.trim());
      }
      if (isAccountRequester) {
        formData.set("isWalletStock", String(createIsWalletStock));
      } else if (createWalletOwnerId) {
        formData.set("walletOwnerId", createWalletOwnerId);
      }
      for (const file of createRequestReceiptFiles) {
        formData.append("receiptFiles", file);
      }

      const response = await fetch("/api/purchase-requests", {
        method: "POST",
        body: formData,
      });

      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Tạo request thất bại");
        return;
      }

      toast.success("Tạo yêu cầu thành công");
      setTitle("");
      setDescription("");
      setExpectedAmountInput("");
      setCreateRequesterId("");
      setCreateRequestReceiptFiles([]);
      setCreateTags([]);
      setCreateWorkshopEmail("");
      setCreateWalletOwnerId("");
      setCreateIsWalletStock(false);
      setCreateModalOpen(false);
      await loadRows();
    } finally {
      setCreatingRequest(false);
    }
  }

  async function runAction(id: string, action: "approve" | "reject", note?: string): Promise<boolean> {
    if (tourDemoActive) {
      toast.info("Đây là phiếu mẫu trong bài hướng dẫn, không thực hiện thật.");
      return false;
    }
    const nextPendingOnCurrentPage = paginatedRows.find(
      (row) => row.id !== id && row.status === "PENDING_APPROVAL"
    )?.id;
    const nextPendingInFilteredRows = filteredRows.find(
      (row) => row.id !== id && row.status === "PENDING_APPROVAL"
    )?.id;
    const nextPendingAnchorId = nextPendingOnCurrentPage ?? nextPendingInFilteredRows ?? null;

    const payload =
      action === "reject"
        ? { note: note ?? "" }
        : { note: "Đồng ý duyệt" };

    setActionLoading({ id, action });
    try {
      const response = await fetch(`/api/purchase-requests/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? `${action} thất bại`);
        return false;
      }

      const actionText = action === "approve" ? "Phê duyệt" : "Từ chối";
      toast.success(`${actionText} thành công`);
      setPendingReviewAnchorId(nextPendingAnchorId);
      await loadRows();
      return true;
    } finally {
      setActionLoading(null);
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 2) {
      toast.error("Vui lòng nhập lý do từ chối (tối thiểu 2 ký tự)");
      return;
    }
    const ok = await runAction(rejectTarget.id, "reject", reason);
    if (ok) {
      setRejectTarget(null);
      setRejectReason("");
    }
  }

  async function deletePurchaseRequest(row: PurchaseRequestRow) {
    const confirmed = window.confirm(
      `Xác nhận xóa yêu cầu mua?\n\n${row.title}\n${Number(row.expectedAmount).toLocaleString("vi-VN")} ${row.currencyCode}`
    );
    if (!confirmed) return;

    setDeletingRequestId(row.id);
    try {
      const response = await fetch(`/api/purchase-requests/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const data = await readResponseJsonSafe<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Xóa yêu cầu mua thất bại");
        return;
      }

      toast.success("Đã xóa yêu cầu mua");
      await loadRows();
    } finally {
      setDeletingRequestId(null);
    }
  }

  async function confirmTransfer(id: string) {
    if (tourDemoActive) {
      toast.info("Đây là phiếu mẫu trong bài hướng dẫn, không ghi sổ thật.");
      return;
    }
    const paymentAmountValue = Number(paymentAmountInput);
    if (!Number.isFinite(paymentAmountValue) || paymentAmountValue <= 0) {
      toast.error("Số tiền thực chuyển phải lớn hơn 0");
      return;
    }

    setConfirming(true);
    const formData = new FormData();
    formData.set("paymentNote", paymentNote);
    formData.set("paymentAmount", String(paymentAmountValue));
    formData.set("paymentCurrencyCode", paymentCurrencyCode);
    if (paymentCategoryId) {
      formData.set("paymentCategoryId", paymentCategoryId);
    }
    if (paymentAccountId) {
      formData.set("paymentAccountId", paymentAccountId);
    }
    for (const file of receiptFiles) {
      formData.append("receiptFiles", file);
    }

    const response = await fetch(`/api/purchase-requests/${id}/pay`, {
      method: "POST",
      body: formData,
    });

    const data = await readResponseJsonSafe<{ error?: string; receiptCount?: number }>(response);
    if (!response.ok) {
      toast.error(data.error ?? "Xác nhận chuyển tiền thất bại");
      setConfirming(false);
      return;
    }

    toast.success(`Đã xác nhận chuyển tiền (${data.receiptCount ?? 0} ảnh chứng từ)`);
    setConfirming(false);
    setConfirmingRow(null);
    setPaymentNote("");
    setPaymentAmountInput("");
    setPaymentCurrencyCode("USD");
    setPaymentCategoryId("");
    setPaymentAccountId("");
    setReceiptFiles([]);
    await loadRows();
  }

  async function loadPaymentAccounts() {
    const response = await fetch("/api/payment-accounts", { cache: "no-store" });
    const data = await readResponseJsonSafe<{ error?: string; rows?: PaymentAccount[] }>(response);
    if (!response.ok) {
      return;
    }
    const accounts = Array.isArray(data.rows) ? data.rows : [];
    setPaymentAccounts(accounts);
    setPaymentAccountId((prev) => {
      if (!accounts.length) return "";
      const hasPrev = accounts.some((account) => account.id === prev);
      return hasPrev ? prev : accounts[0].id;
    });
  }

  async function addReceipts(id: string) {
    if (!manageReceiptFiles.length) {
      toast.error("Vui lòng chọn ít nhất 1 ảnh chứng từ");
      return;
    }

    setSavingReceipts(true);
    const formData = new FormData();
    for (const file of manageReceiptFiles) {
      formData.append("receiptFiles", file);
    }

    const response = await fetch(`/api/purchase-requests/${id}/receipts`, {
      method: "POST",
      body: formData,
    });
    const data = await readResponseJsonSafe<{ error?: string; rows?: Array<{ id: string }> }>(response);
    if (!response.ok) {
      toast.error(data.error ?? "Tải ảnh chứng từ thất bại");
      setSavingReceipts(false);
      return;
    }

    toast.success(`Đã thêm ${data.rows?.length ?? 0} ảnh chứng từ`);
    setSavingReceipts(false);
    setManageReceiptFiles([]);
    setManageReceiptPreviews((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    await loadRows();
  }

  async function removeReceipt(requestId: string, receiptId: string) {
    setDeletingReceiptId(receiptId);
    const response = await fetch(`/api/purchase-requests/${requestId}/receipts/${receiptId}`, {
      method: "DELETE",
    });
    const data = await readResponseJsonSafe<{ error?: string }>(response);
    if (!response.ok) {
      toast.error(data.error ?? "Xóa ảnh chứng từ thất bại");
      setDeletingReceiptId(null);
      return;
    }

    toast.success("Đã xóa ảnh chứng từ");
    setDeletingReceiptId(null);
    await loadRows();
  }

  async function loadTimelineForRequest(row: PurchaseRequestRow) {
    const cachedRows = timelineCache[row.id];
    if (cachedRows) {
      setTimelineRows(cachedRows);
      return;
    }

    setTimelineLoading(true);
    setTimelineRows([]);
    try {
      const response = await fetch(
        `/api/logs?entityType=purchase_request&entityId=${encodeURIComponent(row.id)}&page=1&pageSize=100&order=desc`,
        { cache: "no-store" },
      );
      const data = await readResponseJsonSafe<{ error?: string; rows?: TimelineLog[] }>(response);
      if (!response.ok) {
        toast.error(data.error ?? "Không tải được timeline yêu cầu mua");
        return;
      }

      const fetchedRows = Array.isArray(data.rows) ? data.rows : [];
      const sortedRows = [...fetchedRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTimelineRows(sortedRows);
      setTimelineCache((prev) => ({ ...prev, [row.id]: sortedRows }));
    } finally {
      setTimelineLoading(false);
    }
  }

  async function onManageReceiptFilesChange(files: FileList | null) {
    const nextFiles = await snapshotFiles(files ?? []);
    setManageReceiptFiles(nextFiles);
    setManageReceiptPreviews((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return nextFiles.map((file) => ({
        url: URL.createObjectURL(file),
        name: file.name,
      }));
    });
  }

  useEffect(() => {
    return () => {
      manageReceiptPreviews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [manageReceiptPreviews]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Danh sách yêu cầu</CardTitle>
          <div className="flex flex-wrap gap-2">
            {(roles.includes("ACCOUNTANT") || roles.includes("ADMIN")) && (
              <Button
                size="sm"
                variant="outline"
                data-tour="conversion-button"
                onClick={() => {
                  setConversionModalOpen(true);
                  void loadPaymentAccounts();
                }}
              >
                <RefreshCcw className="mr-2 size-4" />
                Quy đổi tiền tệ
              </Button>
            )}
            {canCreateRequest ? (
              <Button size="sm" variant="outline" data-tour="collection-button" onClick={() => openCreateModal("COLLECTION")}>
                Tạo yêu cầu thu
              </Button>
            ) : null}
            {roleDocLink ? (
              <div className="flex items-center">
                <Button size="sm" variant="ghost" asChild>
                  <a href={roleDocLink.href} target="_blank" rel="noreferrer">
                    <BookOpen className="mr-2 size-4" />
                    {roleDocLink.label}
                  </a>
                </Button>
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-amber-600 transition hover:bg-muted"
                        aria-label={roleDocLink.hint}
                      >
                        <AlertCircle className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[280px]">{roleDocLink.hint}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : null}
            {showTour ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => (tourChapters.length ? setTourMenuOpen(true) : startTour())}
              >
                <HelpCircle className="mr-2 size-4" />
                Hướng dẫn
              </Button>
            ) : null}
            {canCreateRequest ? (
              <Button size="sm" data-tour="create-button" onClick={() => openCreateModal("PURCHASE")}>
                Tạo yêu cầu mua
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2 [&>div]:w-full sm:[&>div]:w-auto" data-tour="filters">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Khoảng ngày</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" type="button" variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 size-4" />
                      {draftDateRange?.from
                        ? `${draftDateRange.from.toLocaleDateString("vi-VN")} - ${
                            draftDateRange.to ? draftDateRange.to.toLocaleDateString("vi-VN") : "..."
                          }`
                        : "Chọn từ ngày đến ngày"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="range" numberOfMonths={2} selected={draftDateRange} onSelect={setDraftDateRange} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="min-w-72 flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Từ khóa</Label>
                <Input
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder="Tìm tiêu đề, mô tả, người tạo, số tiền..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Người tạo</Label>
                <Select value={draftRequesterId} onValueChange={setDraftRequesterId}>
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder="Người tạo yêu cầu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả người tạo</SelectItem>
                    {requesterOptions.map((requester) => (
                      <SelectItem key={requester.id} value={requester.id}>
                        {requester.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Danh mục</Label>
                <Select value={draftCategoryFilterId} onValueChange={setDraftCategoryFilterId}>
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả danh mục</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        [{category.type === "EXPENSE" ? "Chi" : "Thu"}] {categoryDisplayName(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Loại yêu cầu</Label>
                <Select
                  value={draftKindFilter}
                  onValueChange={(value) => setDraftKindFilter(value as "__ALL__" | "PURCHASE" | "COLLECTION")}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Loại yêu cầu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả loại</SelectItem>
                    <SelectItem value="PURCHASE">Yêu cầu mua</SelectItem>
                    <SelectItem value="COLLECTION">Yêu cầu thu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Trạng thái</Label>
                <Select
                  value={draftStatusFilter}
                  onValueChange={(value) => setDraftStatusFilter(value as PurchaseRequestStatusFilter)}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__ALL__">Tất cả trạng thái</SelectItem>
                    <SelectItem value="PENDING_APPROVAL">Chờ duyệt</SelectItem>
                    <SelectItem value="APPROVED">Đã duyệt</SelectItem>
                    <SelectItem value="PAID">Đã thanh toán</SelectItem>
                    <SelectItem value="REJECTED">Từ chối</SelectItem>
                    <SelectItem value="CANCELLED">Đã hủy</SelectItem>
                    <SelectItem value="DRAFT">Nháp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button size="sm" type="button" onClick={applyFilters}>
                  Lọc
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={clearFilters}
                  disabled={
                    !draftDateRange?.from &&
                    !draftDateRange?.to &&
                    !draftSearch.trim() &&
                    draftRequesterId === "__ALL__" &&
                    draftCategoryFilterId === "__ALL__" &&
                    draftStatusFilter === "__ALL__" &&
                    draftKindFilter === "__ALL__"
                  }
                >
                  Xóa bộ lọc
                </Button>
              </div>
            </div>
          </div>
          <div className="rounded-lg border" data-tour="request-table">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead>STT</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Người yêu cầu</TableHead>
                  <TableHead>Tiêu đề / Mô tả</TableHead>
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Số tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Người xử lý</TableHead>
                  <TableHead>Xác nhận chuyển tiền</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Ảnh chứng từ</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tourDemoActive ? TOUR_DEMO_ROWS : paginatedRows).map((row, index) => {
                  const approvedBy = row.approvals?.find((approval) => approval.action === "APPROVE")?.actor.fullName;
                  const rejectApproval = row.approvals?.find((approval) => approval.action === "REJECT");
                  const rejectedBy = rejectApproval?.actor.fullName;
                  const rejectNote = rejectApproval?.note?.trim();
                  const reviewerName = row.status === "REJECTED" ? rejectedBy ?? "Chưa có" : approvedBy ?? "Chưa duyệt";
                  const confirmedBy = row.transactions?.[0]?.creator.fullName;
                  const transferNote = getTransferNote(row.transactions?.[0]);
                  const status = statusUi(row.status);
                  const conversionStatus = currencyConversionStatusUi(row.currencyConversionStatus);
                  const amountVnd = Number(row.expectedAmount) * (row.currencyCode === "USD" ? 25_000 : 1);
                  const categoryApprovalThresholdVnd =
                    row.category?.accountantApprovalThresholdVnd ?? accountantApprovalThresholdVnd;
                  const canAccountantApprove =
                    roles.includes("ACCOUNTANT") &&
                    !roles.includes("ADMIN") &&
                    amountVnd <= categoryApprovalThresholdVnd;
                  const showApproveAction =
                    row.status === "PENDING_APPROVAL" && (roles.includes("ADMIN") || canAccountantApprove);
                  const showRejectAction = roles.includes("ADMIN") && row.status === "PENDING_APPROVAL";
                  const showConfirmTransfer = (roles.includes("ACCOUNTANT") || roles.includes("ADMIN")) && row.status === "APPROVED";
                  const rowActionLoading = actionLoading?.id === row.id ? actionLoading.action : null;

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="align-top">{(safeCurrentPage - 1) * pageSize + index + 1}</TableCell>
                      <TableCell className="align-top">
                        {new Date(row.createdAt).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="text-sm font-medium">{row.requester.fullName}</p>
                        <p className="text-sm">{row.requester.email}</p>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className={
                            row.kind === "COLLECTION"
                              ? "mb-1 border-emerald-200 bg-emerald-100 text-emerald-700"
                              : "mb-1 border-rose-200 bg-rose-100 text-rose-700"
                          }
                        >
                          {row.kind === "COLLECTION" ? "Yêu cầu thu" : "Yêu cầu mua"}
                        </Badge>
                        <p className="text-sm font-medium">{row.title}</p>
                        <p className="mt-1 text-sm whitespace-pre-line">{row.description}</p>
                      </TableCell>
                      <TableCell className="align-top">
                        <p>{row.category ? categoryDisplayName(row.category) : "Chưa chọn"}</p>
                        {row.tags?.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">{row.tags.join(", ")}</p>
                        ) : null}
                        {row.workshopEmail ? (
                          <p className="mt-1 text-xs text-muted-foreground">{row.workshopEmail}</p>
                        ) : null}
                        {row.walletOwnerName ? (
                          <p className="mt-1 text-xs text-muted-foreground">Mua lại từ ví: {row.walletOwnerName}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="font-medium">
                          Thực chuyển:{" "}
                          {row.transactions?.[0]
                            ? `${Number(row.transactions[0].amountOriginal).toLocaleString("vi-VN")} ${row.transactions[0].currencyCode}`
                            : "Chưa có"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Yêu cầu: {Number(row.expectedAmount).toLocaleString("vi-VN")} {row.currencyCode}
                        </p>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge className={status.className} variant="outline">
                          {status.label}
                        </Badge>
                        {conversionStatus ? (
                          <Badge className={`mt-1 block w-fit ${conversionStatus.className}`} variant="outline">
                            {conversionStatus.label}
                          </Badge>
                        ) : null}
                        {row.status === "REJECTED" && rejectNote ? (
                          <p className="mt-1 max-w-[220px] whitespace-pre-line text-xs text-rose-700">
                            Lý do: {rejectNote}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top text-sm">{reviewerName}</TableCell>
                      <TableCell className="align-top text-sm">{confirmedBy ?? "Chưa xác nhận"}</TableCell>
                      <TableCell className="align-top text-sm whitespace-pre-line">
                        {transferNote || "Không có"}
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="text-xs text-muted-foreground">({row.receiptImages?.length ?? 0})</p>
                        {!!row.receiptImages?.length && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {row.receiptImages.slice(0, 3).map((image) => (
                              <a key={image.id} href={image.filePath} target="_blank" rel="noreferrer">
                                <Image
                                  src={image.filePath}
                                  alt={image.fileName}
                                  width={32}
                                  height={32}
                                  unoptimized
                                  className="size-8 rounded-md border object-cover transition hover:opacity-85"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap justify-end gap-2" data-tour="row-actions">
                          {showApproveAction && (
                            <Button
                              size="xs"
                              data-tour="approve-button"
                              disabled={Boolean(rowActionLoading)}
                              onClick={() => runAction(row.id, "approve")}
                            >
                              {rowActionLoading === "approve" ? "Đang duyệt..." : "Duyệt"}
                            </Button>
                          )}
                          {showRejectAction && (
                            <Button
                              size="xs"
                              data-tour="reject-button"
                              variant="destructive"
                              disabled={Boolean(rowActionLoading)}
                              onClick={() => {
                                setRejectReason("");
                                setRejectTarget({ id: row.id, title: row.title });
                              }}
                            >
                              {rowActionLoading === "reject" ? "Đang từ chối..." : "Từ chối"}
                            </Button>
                          )}
                          {showConfirmTransfer && (
                            <Button
                              size="xs"
                              data-tour="pay-button"
                              variant="secondary"
                              onClick={() => {
                                setConfirmingRow(row);
                                setPaymentAmountInput(String(Number(row.expectedAmount)));
                                setPaymentCurrencyCode(row.currencyCode);
                                setPaymentCategoryId(row.category?.id ?? "");
                                setPaymentAccountId("");
                                setPaymentNote("");
                                setReceiptFiles([]);
                                void loadPaymentAccounts();
                              }}
                            >
                              {row.kind === "COLLECTION" ? "Xác nhận đã nhận tiền" : "Xác nhận chuyển tiền"}
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="outline"
                            title="Xem timeline"
                            aria-label="Xem timeline"
                            onClick={() => {
                              setTimelineRow(row);
                              void loadTimelineForRequest(row);
                            }}
                          >
                            <Clock3 className="size-4" />
                          </Button>
                          {canDeletePurchaseRequest ? (
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => {
                                void deletePurchaseRequest(row);
                              }}
                              disabled={deletingRequestId === row.id}
                            >
                              {deletingRequestId === row.id ? "Xóa..." : "Xóa"}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!paginatedRows.length && (
                  <TableRow>
                    <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                      Không có dữ liệu.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Trang {safeCurrentPage}/{totalPages} • Tổng {filteredRows.length} yêu cầu
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
              >
                Trang trước
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
              >
                Trang sau
              </Button>
            </div>
          </div>

          {roles.includes("ACCOUNTANT") && !roles.includes("ADMIN") && (
            <p className="text-xs text-muted-foreground">
              Kế toán duyệt theo ngưỡng từng danh mục. Nếu danh mục chưa cấu hình riêng, dùng ngưỡng mặc định{" "}
              {accountantApprovalThresholdVnd.toLocaleString("vi-VN")} VND
              {accountantApprovalThresholdVnd === defaultApprovalThresholdVnd ? " (mặc định hệ thống)" : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={tourMenuOpen} onOpenChange={setTourMenuOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Hướng dẫn sử dụng</DialogTitle>
            <DialogDescription>Chọn phần bạn muốn xem. Mỗi bài đi thẳng vào một công đoạn.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-md border">
            {tourChapters.map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-0.5 px-3 py-3 text-left transition hover:bg-muted"
                  onClick={() => {
                    setTourMenuOpen(false);
                    window.setTimeout(() => startTour(chapter.id), 150);
                  }}
                >
                  <span className="text-sm font-medium">{chapter.title}</span>
                  <span className="text-xs text-muted-foreground">{chapter.description}</span>
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTourMenuOpen(false);
                window.setTimeout(() => startTour(), 150);
              }}
            >
              Xem toàn bộ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CurrencyConversionDialog
        open={conversionModalOpen}
        onOpenChange={setConversionModalOpen}
        lockClose={tourActive}
        candidateRows={conversionCandidateRows}
        paymentAccounts={paymentAccounts}
        onCreated={loadRows}
      />

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-xl"
          onInteractOutside={(event) => {
            if (tourActive) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (tourActive) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{createKind === "COLLECTION" ? "Tạo yêu cầu thu" : "Tạo yêu cầu mua"}</DialogTitle>
            <DialogDescription>
              {createKind === "COLLECTION"
                ? "Nhập thông tin yêu cầu thu. Khi Admin xác nhận đã nhận tiền, sổ giao dịch sẽ ghi Thu."
                : "Nhập thông tin yêu cầu mua, sau đó gửi tạo mới."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {canSelectRequester && (
              <div className="space-y-2" data-tour="form-requester">
                <Label>Nhân viên (không bắt buộc)</Label>
                <Select
                  value={createRequesterId || undefined}
                  onValueChange={(value) => setCreateRequesterId(value === "__NONE__" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhân viên" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Chọn nhân viên</SelectItem>
                    {teamUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2" data-tour="form-title">
              <Label>Tiêu đề</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2" data-tour="form-description">
              <Label>Mô tả</Label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="space-y-2" data-tour="form-tags">
              <Label>Tag</Label>
              <TagInput tags={createTags} onTagsChange={setCreateTags} disabled={creatingRequest} />
            </div>
            <div className="space-y-2" data-tour="form-currency">
              <Label>Tiền tệ</Label>
              <Tabs value={currencyCode} onValueChange={(value) => setCurrencyCode(value as "USD" | "VND")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="VND">VND</TabsTrigger>
                  <TabsTrigger value="USD">USD</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-2">
              <Label>Loại yêu cầu</Label>
              <div>
                <Badge
                  variant="outline"
                  className={
                    createKind === "COLLECTION"
                      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                      : "border-rose-200 bg-rose-100 text-rose-700"
                  }
                >
                  {createKind === "COLLECTION" ? "Yêu cầu thu — chọn danh mục Thu" : "Yêu cầu mua — chọn danh mục Chi"}
                </Badge>
              </div>
            </div>
            <div className="space-y-2" data-tour="form-category">
              <Label>Danh mục</Label>
              <Button
                size="sm"
                type="button"
                variant="outline"
                className="w-full justify-start text-left font-normal"
                disabled={!filteredCategories.length}
                onClick={() => setCategoryPickerOpen(true)}
              >
                {selectedCreateCategory ? categoryDisplayName(selectedCreateCategory) : "Chọn danh mục"}
              </Button>
              {!filteredCategories.length && (
                <p className="text-xs text-muted-foreground">Không có danh mục cho loại đã chọn.</p>
              )}
            </div>
            {createKind === "PURCHASE" && isAccountRequester ? (
              <div className="space-y-2 rounded-md border p-3" data-tour="form-wallet-stock">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={createIsWalletStock}
                    onChange={(event) => setCreateIsWalletStock(event.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Mua để chia lại cho team</span>
                    <span className="block text-xs text-muted-foreground">
                      Chỉ tích nếu đây là hàng mua để người khác lấy lại, mặc định không đưa vào ví.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}

            {createKind === "PURCHASE" && accountOptions.length && roles.includes("EMPLOYEE") ? (
              <div className="space-y-2" data-tour="form-account-wallet">
                <Label>Lấy hàng từ Account (không bắt buộc)</Label>
                <Select
                  value={createWalletOwnerId || "__NONE__"}
                  onValueChange={(value) => setCreateWalletOwnerId(value === "__NONE__" ? "" : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Mua ngoài" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Mua ngoài</SelectItem>
                    {accountOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Chỉ chọn khi bạn lấy hàng có sẵn của người đó thay vì mua ngoài.
                </p>
              </div>
            ) : null}

            {selectedCreateCategory?.contactEmail || createWorkshopEmail ? (
              <div className="space-y-2">
                <Label htmlFor="create-workshop-email">Email xưởng</Label>
                <Input
                  id="create-workshop-email"
                  type="email"
                  value={createWorkshopEmail}
                  onChange={(event) => setCreateWorkshopEmail(event.target.value)}
                  placeholder="Email của xưởng"
                />
                <p className="text-xs text-muted-foreground">Tự điền theo xưởng đã chọn, sửa được nếu cần.</p>
              </div>
            ) : null}
            <div className="space-y-2" data-tour="form-amount">
              <Label>Số tiền đề xuất</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={expectedAmountInput}
                onChange={(event) => setExpectedAmountInput(event.target.value)}
                placeholder="Nhập số tiền đề xuất"
              />
              <p className="text-sm text-muted-foreground">
                {amountInWords ? `Bằng chữ: ${amountInWords}` : "Nhập trực tiếp tổng số tiền cần đề xuất."}
              </p>
            </div>
            <div className="space-y-2" data-tour="form-receipts">
              <Label>Ảnh chứng từ</Label>
              <ReceiptImageUploader
                files={createRequestReceiptFiles}
                onFilesChange={setCreateRequestReceiptFiles}
                disabled={creatingRequest}
                chooseButtonLabel="Chọn ảnh chứng từ"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateModalOpen(false);
                setCreateRequesterId("");
                setCreateRequestReceiptFiles([]);
                setCreateTags([]);
                setCreateWorkshopEmail("");
                setCreateWalletOwnerId("");
                setCreateIsWalletStock(false);
              }}
            >
              Hủy
            </Button>
            <Button size="sm" data-tour="form-submit" disabled={creatingRequest} onClick={createRequest}>
              {creatingRequest ? "Đang tạo..." : "Tạo yêu cầu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryPickerOpen}
        onOpenChange={setCategoryPickerOpen}
      >
        <DialogContent className="overflow-y-auto sm:max-w-4xl"
          onInteractOutside={(event) => {
            if (tourActive) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (tourActive) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Chọn danh mục</DialogTitle>
            <DialogDescription>
              Danh sách danh mục loại {categoryType === "EXPENSE" ? "Chi" : "Thu"}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto" data-tour="category-list">
            <CategoryPickerTree
              nodes={categoryTree}
              selectedId={categoryId}
              onSelect={(nextId) => {
                setCategoryId(nextId);
                setCategoryPickerOpen(false);
              }}
              emptyLabel="Không có danh mục cho loại đã chọn."
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setCategoryPickerOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmingRow)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingRow(null);
            setPaymentNote("");
            setPaymentAmountInput("");
            setPaymentCurrencyCode("USD");
            setPaymentCategoryId("");
            setPaymentAccountId("");
            setReceiptFiles([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl"
          onInteractOutside={(event) => {
            if (tourActive) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (tourActive) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {confirmingRow?.kind === "COLLECTION" ? "Xác nhận đã nhận tiền" : "Xác nhận chuyển tiền"}
            </DialogTitle>
            <DialogDescription>
              Người xác nhận kiểm tra lại thông tin, thêm ghi chú và tải ảnh chứng từ trước khi xác nhận.
            </DialogDescription>
          </DialogHeader>
          {confirmingRow && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <p><span className="font-medium">Tiêu đề:</span> {confirmingRow.title}</p>
                <p>
                  <span className="font-medium">Danh mục hiện tại:</span>{" "}
                  {confirmingRow.category ? confirmingRow.category.name : "Chưa chọn"}
                </p>
              </div>

              <div className="space-y-2" data-tour="pay-category">
                <Label>{confirmingRow.kind === "COLLECTION" ? "Danh mục thu" : "Danh mục thanh toán"}</Label>
                <Select
                  value={paymentCategoryId || "__NONE__"}
                  onValueChange={(value) => setPaymentCategoryId(value === "__NONE__" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Giữ danh mục hiện tại" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Giữ danh mục hiện tại</SelectItem>
                    {paymentCategoryOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {categoryDisplayName(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPaymentCategory ? (
                  <p className="text-xs text-muted-foreground">
                    Sẽ hạch toán vào: {categoryDisplayName(selectedPaymentCategory)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nếu không chọn, hệ thống dùng danh mục hiện tại hoặc danh mục chi mặc định.
                  </p>
                )}
              </div>

              <div className="space-y-2" data-tour="pay-amount">
                <Label>Số tiền thực chuyển</Label>
                <Tabs value={paymentCurrencyCode} onValueChange={(value) => setPaymentCurrencyCode(value as "USD" | "VND")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="VND">VND</TabsTrigger>
                    <TabsTrigger value="USD">USD</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentAmountInput}
                  onChange={(event) => setPaymentAmountInput(event.target.value)}
                  placeholder="Nhập số tiền thực chuyển"
                />
                <p className="text-xs text-muted-foreground">
                  Mặc định theo số tiền và tiền tệ của yêu cầu, kế toán có thể chỉnh theo số tiền thực chi.
                </p>
                <p className="text-xs text-muted-foreground">
                  Số tiền yêu cầu: {Number(confirmingRow.expectedAmount).toLocaleString("vi-VN")} {confirmingRow.currencyCode}
                </p>
              </div>

              <div className="space-y-2" data-tour="pay-account">
                <Label>Tài khoản thanh toán</Label>
                <Select
                  value={paymentAccountId || "__NONE__"}
                  onValueChange={(value) => setPaymentAccountId(value === "__NONE__" ? "" : value)}
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

              <div className="space-y-2" data-tour="pay-transaction-id">
                <Label>Transaction ID</Label>
                <Input
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                  placeholder="Mã giao dịch chuyển khoản"
                />
              </div>

              <div className="space-y-2" data-tour="pay-receipts">
                <Label>Ảnh chứng từ (có thể chọn nhiều ảnh)</Label>
                <ReceiptImageUploader
                  files={receiptFiles}
                  onFilesChange={setReceiptFiles}
                  disabled={confirming}
                  chooseButtonLabel="Chọn ảnh chứng từ"
                  hint="Kéo thả hoặc dán ảnh chứng từ vào đây."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirmingRow(null);
                setPaymentNote("");
                setPaymentAmountInput("");
                setPaymentCurrencyCode("USD");
                setPaymentCategoryId("");
                setPaymentAccountId("");
                setReceiptFiles([]);
              }}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              disabled={confirming || !confirmingRow}
              onClick={() => {
                if (confirmingRow) void confirmTransfer(confirmingRow.id);
              }}
            >
              {confirming
                ? "Đang xác nhận..."
                : confirmingRow?.kind === "COLLECTION"
                  ? "Xác nhận đã nhận tiền"
                  : "Xác nhận chuyển tiền"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(managingReceiptsId)}
        onOpenChange={(open) => {
          if (!open) {
            setManagingReceiptsId(null);
            setManageReceiptFiles([]);
            setManageReceiptPreviews((current) => {
              current.forEach((item) => URL.revokeObjectURL(item.url));
              return [];
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Quản lý ảnh chứng từ</DialogTitle>
            <DialogDescription>
              Kế toán có thể thêm hoặc xóa ảnh chứng từ bất kỳ lúc nào.
            </DialogDescription>
          </DialogHeader>
          {managingReceiptsRow && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p><span className="font-medium">Tiêu đề:</span> {managingReceiptsRow.title}</p>
                <p>
                  <span className="font-medium">Số tiền:</span>{" "}
                  {Number(managingReceiptsRow.expectedAmount).toLocaleString("vi-VN")} {managingReceiptsRow.currencyCode}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Danh sách ảnh hiện có ({managingReceiptsRow.receiptImages?.length ?? 0})</Label>
                {!!managingReceiptsRow.receiptImages?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {managingReceiptsRow.receiptImages.map((image) => (
                      <div key={image.id} className="relative">
                        <a href={image.filePath} target="_blank" rel="noreferrer">
                          <Image
                            src={image.filePath}
                            alt={image.fileName}
                            width={64}
                            height={64}
                            unoptimized
                            className="size-16 rounded-md border object-cover"
                          />
                        </a>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute -right-2 -top-2 h-6 px-2 text-xs"
                          disabled={deletingReceiptId === image.id}
                          onClick={() => void removeReceipt(managingReceiptsRow.id, image.id)}
                        >
                          {deletingReceiptId === image.id ? "Đang xóa..." : "Xóa"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Chưa có ảnh chứng từ
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Thêm ảnh chứng từ</Label>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void onManageReceiptFilesChange(event.currentTarget.files)}
                />
                <p className="text-xs text-muted-foreground">Đã chọn: {manageReceiptFiles.length} ảnh</p>
                {!!manageReceiptPreviews.length && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {manageReceiptPreviews.map((preview, index) => (
                      <a key={`${preview.name}-${index}`} href={preview.url} target="_blank" rel="noreferrer">
                        <Image
                          src={preview.url}
                          alt={preview.name}
                          width={64}
                          height={64}
                          unoptimized
                          className="size-16 rounded-md border object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setManagingReceiptsId(null);
                setManageReceiptFiles([]);
                setManageReceiptPreviews((current) => {
                  current.forEach((item) => URL.revokeObjectURL(item.url));
                  return [];
                });
              }}
            >
              Đóng
            </Button>
            <Button
              size="sm"
              disabled={savingReceipts || !manageReceiptFiles.length || !managingReceiptsRow}
              onClick={() => {
                if (managingReceiptsRow) {
                  void addReceipts(managingReceiptsRow.id);
                }
              }}
            >
              {savingReceipts ? "Đang tải ảnh..." : "Thêm ảnh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(timelineRow)} onOpenChange={(open) => !open && setTimelineRow(null)}>
        <DialogContent className="w-[96vw] max-w-[calc(100vw-2rem)] lg:max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>Timeline yêu cầu mua</DialogTitle>
            <DialogDescription>
              {timelineRow ? `${timelineRow.title} (${timelineRow.id})` : "Lịch sử thao tác"}
            </DialogDescription>
          </DialogHeader>
          {timelineLoading ? <p className="text-sm text-muted-foreground">Đang tải timeline...</p> : null}
          {!timelineLoading && !timelineRows.length ? (
            <p className="text-sm text-muted-foreground">Không có log cho yêu cầu mua này.</p>
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
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Từ chối yêu cầu mua</DialogTitle>
            <DialogDescription>
              Nhập lý do từ chối để người yêu cầu biết mà bổ sung/chỉnh sửa.
            </DialogDescription>
          </DialogHeader>
          {rejectTarget ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{rejectTarget.title}</p>
              <div className="grid gap-2">
                <Label htmlFor="reject-reason">Lý do từ chối</Label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Ví dụ: Vượt ngân sách quý, thiếu báo giá, sai danh mục..."
                  rows={4}
                  maxLength={500}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">{rejectReason.trim().length}/500 ký tự</p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={actionLoading?.action === "reject"}
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionLoading?.action === "reject" || rejectReason.trim().length < 2}
              onClick={() => void submitReject()}
            >
              {actionLoading?.action === "reject" ? "Đang từ chối..." : "Xác nhận từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
