import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DOMAINS = ["overview", "transactions", "purchases", "accounts", "receivables", "conversions"] as const;
type Domain = typeof DOMAINS[number];

function authorized(request: Request) {
  const expected = env.felineAiReadSecret;
  const supplied = request.headers.get("x-feline-ai-secret") || "";
  if (!expected || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function dateParam(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskAccount(value: string) {
  const clean = value.replace(/\s+/g, "");
  return clean.length <= 4 ? clean : `•••• ${clean.slice(-4)}`;
}

function dayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function sumBy<T>(rows: T[], value: (row: T) => number) {
  return rows.reduce((total, row) => total + value(row), 0);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const domain = (params.get("domain") || "overview") as Domain;
  if (!DOMAINS.includes(domain)) return NextResponse.json({ message: "Unsupported domain" }, { status: 400 });

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = dateParam(params.get("startDate")) || defaultStart;
  const endDate = dateParam(params.get("endDate"), true) || now;
  const q = (params.get("q") || "").trim().slice(0, 120);
  const transactionWhere = {
    transactionDate: { gte: startDate, lte: endDate },
    ...(q ? { OR: [{ description: { contains: q } }, { transactionRef: { contains: q } }, { category: { name: { contains: q } } }] } : {})
  };
  const report = {
    startDate: dayKey(startDate),
    endDate: dayKey(endDate),
    timeZone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    generatedAt: new Date().toISOString()
  };
  const source = { id: "accountant.felineez.com", access: "read-only" as const, dataUpdatedAt: new Date().toISOString() };

  if (domain === "transactions" || domain === "overview") {
    const transactions = await prisma.transaction.findMany({
      where: transactionWhere,
      orderBy: { transactionDate: "desc" },
      take: domain === "overview" ? 1000 : 200,
      select: {
        id: true, direction: true, amountOriginal: true, currencyCode: true, amountVnd: true,
        description: true, transactionRef: true, transactionDate: true, paymentMethod: true, status: true,
        category: { select: { id: true, name: true, type: true, parent: { select: { name: true } } } },
        paymentAccount: { select: { id: true, accountName: true, bankName: true } },
        teamUsers: { select: { user: { select: { id: true, fullName: true } } } }
      }
    });
    const income = sumBy(transactions.filter((row) => row.direction === "IN"), (row) => number(row.amountVnd));
    const expense = sumBy(transactions.filter((row) => row.direction === "OUT"), (row) => number(row.amountVnd));
    if (domain === "transactions") {
      return NextResponse.json({ report, source, summary: { count: transactions.length, income, expense, netCashFlow: income - expense }, transactions: transactions.map((row) => ({ ...row, amountOriginal: number(row.amountOriginal), amountVnd: number(row.amountVnd), teamUsers: row.teamUsers.map((link) => link.user) })) });
    }

    const [purchaseGroups, purchases, receivables, accounts, conversions] = await Promise.all([
      prisma.purchaseRequest.groupBy({ by: ["status"], _count: { _all: true }, _sum: { expectedAmount: true } }),
      prisma.purchaseRequest.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, kind: true, expectedAmount: true, currencyCode: true, status: true, createdAt: true, requester: { select: { fullName: true } }, category: { select: { name: true } } } }),
      prisma.externalReceivable.findMany({ where: { status: { in: ["OPEN", "PARTIAL"] } }, select: { id: true, title: true, amountVnd: true, dueDate: true, status: true, party: { select: { name: true } }, payments: { select: { amountVnd: true } } } }),
      prisma.paymentAccount.count({ where: { isActive: true } }),
      prisma.currencyConversion.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountUsd: true, amountVnd: true } })
    ]);
    const categoryMap = new Map<string, { name: string; income: number; expense: number }>();
    const trendMap = new Map<string, { date: string; income: number; expense: number }>();
    for (const row of transactions) {
      const category = categoryMap.get(row.category.id) || { name: row.category.name, income: 0, expense: 0 };
      category[row.direction === "IN" ? "income" : "expense"] += number(row.amountVnd);
      categoryMap.set(row.category.id, category);
      const key = dayKey(row.transactionDate);
      const trend = trendMap.get(key) || { date: key, income: 0, expense: 0 };
      trend[row.direction === "IN" ? "income" : "expense"] += number(row.amountVnd);
      trendMap.set(key, trend);
    }
    const outstandingReceivables = sumBy(receivables, (row) => Math.max(0, number(row.amountVnd) - sumBy(row.payments, (payment) => number(payment.amountVnd))));
    return NextResponse.json({
      report, source,
      summary: { income, expense, netCashFlow: income - expense, transactions: transactions.length, activeAccounts: accounts, openReceivables: receivables.length, outstandingReceivables },
      trend: [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      categories: [...categoryMap.entries()].map(([id, value]) => ({ id, ...value })).sort((a, b) => (b.income + b.expense) - (a.income + a.expense)).slice(0, 12),
      purchaseStatuses: purchaseGroups.map((row) => ({ status: row.status, count: row._count._all, amount: number(row._sum.expectedAmount) })),
      conversionStatuses: conversions.map((row) => ({ status: row.status, count: row._count._all, amountUsd: number(row._sum.amountUsd), amountVnd: number(row._sum.amountVnd) })),
      recentPurchases: purchases.map((row) => ({ ...row, expectedAmount: number(row.expectedAmount) })),
      receivables: receivables.map((row) => ({ id: row.id, title: row.title, partyName: row.party.name, status: row.status, dueDate: row.dueDate, amountVnd: number(row.amountVnd), paidVnd: sumBy(row.payments, (payment) => number(payment.amountVnd)), outstandingVnd: Math.max(0, number(row.amountVnd) - sumBy(row.payments, (payment) => number(payment.amountVnd))) }))
    });
  }

  if (domain === "purchases") {
    const rows = await prisma.purchaseRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true, description: true, kind: true, expectedAmount: true, currencyCode: true, status: true, createdAt: true, updatedAt: true, requester: { select: { id: true, fullName: true } }, walletOwner: { select: { id: true, fullName: true } }, category: { select: { id: true, name: true, parent: { select: { name: true } } } }, approvals: { orderBy: { actedAt: "desc" }, take: 1, select: { action: true, note: true, actedAt: true, actor: { select: { fullName: true } } } } } });
    return NextResponse.json({ report, source, purchases: rows.map((row) => ({ ...row, expectedAmount: number(row.expectedAmount) })) });
  }

  if (domain === "accounts") {
    const rows = await prisma.paymentAccount.findMany({ where: { isActive: true }, orderBy: { accountName: "asc" }, select: { id: true, accountName: true, bankName: true, accountNumber: true, ownerName: true, transactions: { where: { transactionDate: { gte: startDate, lte: endDate } }, select: { direction: true, amountVnd: true } } } });
    return NextResponse.json({ report, source, accounts: rows.map((row) => { const income = sumBy(row.transactions.filter((tx) => tx.direction === "IN"), (tx) => number(tx.amountVnd)); const expense = sumBy(row.transactions.filter((tx) => tx.direction === "OUT"), (tx) => number(tx.amountVnd)); return { id: row.id, accountName: row.accountName, bankName: row.bankName, accountNumber: maskAccount(row.accountNumber), ownerName: row.ownerName, income, expense, netMovement: income - expense }; }) });
  }

  if (domain === "receivables") {
    const rows = await prisma.externalReceivable.findMany({ orderBy: { occurredAt: "desc" }, take: 200, select: { id: true, title: true, description: true, amountOriginal: true, currencyCode: true, amountVnd: true, occurredAt: true, dueDate: true, status: true, party: { select: { id: true, name: true, type: true } }, payments: { select: { amountOriginal: true, amountVnd: true, paymentDate: true } } } });
    return NextResponse.json({ report, source, receivables: rows.map((row) => ({ ...row, amountOriginal: number(row.amountOriginal), amountVnd: number(row.amountVnd), paidVnd: sumBy(row.payments, (payment) => number(payment.amountVnd)), outstandingVnd: Math.max(0, number(row.amountVnd) - sumBy(row.payments, (payment) => number(payment.amountVnd))), payments: row.payments.map((payment) => ({ ...payment, amountOriginal: number(payment.amountOriginal), amountVnd: number(payment.amountVnd) })) })) });
  }

  const rows = await prisma.currencyConversion.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, walletName: true, bankName: true, amountUsd: true, actualReceivedUsd: true, amountVnd: true, status: true, createdAt: true, decidedAt: true, walletPaymentAccount: { select: { accountName: true } }, receivePaymentAccount: { select: { accountName: true } }, requests: { select: { purchaseRequest: { select: { id: true, title: true } } } } } });
  return NextResponse.json({ report, source, conversions: rows.map((row) => ({ ...row, amountUsd: number(row.amountUsd), actualReceivedUsd: row.actualReceivedUsd === null ? null : number(row.actualReceivedUsd), amountVnd: number(row.amountVnd) })) });
}
