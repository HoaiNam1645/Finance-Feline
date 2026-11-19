import { prisma } from "@/lib/prisma";

const WALLET_STARTED_AT = new Date("2026-11-12T00:00:00+07:00");

export type UserUsdWalletEntry = {
  id: string;
  sourceType: "CONVERSION" | "TRANSACTION";
  direction: "IN" | "OUT";
  title: string;
  amountUsd: number;
  balanceAfterUsd: number;
  occurredAt: string;
  status: string;
  reference: string | null;
  note: string | null;
  paymentAccountName: string | null;
  requestedUsd: number | null;
  receivedVnd: number | null;
};

export type UserUsdWallet = {
  userId: string;
  fullName: string;
  email: string;
  balanceUsd: number;
  totalInUsd: number;
  totalOutUsd: number;
  conversionHistory: UserUsdWalletEntry[];
  transactionHistory: UserUsdWalletEntry[];
};

export async function getUsdWalletsByRole(roleCode: "ADMIN" | "ACCOUNTANT"): Promise<UserUsdWallet[]> {
  const owners = await prisma.user.findMany({
    where: { roles: { some: { role: { code: roleCode } } } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, email: true },
  });
  if (!owners.length) return [];

  const ownerIds = owners.map((owner) => owner.id);
  const [conversions, expenses] = await Promise.all([
    prisma.currencyConversion.findMany({
      where: {
        createdBy: { in: ownerIds },
        status: "SUCCEEDED",
        actualReceivedUsd: { not: null },
      },
      select: {
        id: true,
        createdBy: true,
        amountUsd: true,
        actualReceivedUsd: true,
        amountVnd: true,
        walletName: true,
        notes: true,
        receiveTransactionId: true,
        decidedAt: true,
        createdAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        currencyCode: "USD",
        createdAt: { gte: WALLET_STARTED_AT },
        OR: [
          { approvedBy: { in: ownerIds } },
          { approvedBy: null, createdBy: { in: ownerIds } },
        ],
      },
      select: {
        id: true,
        direction: true,
        createdBy: true,
        approvedBy: true,
        amountOriginal: true,
        description: true,
        transactionRef: true,
        transactionDate: true,
        status: true,
        paymentAccount: { select: { accountName: true, bankName: true, accountNumber: true } },
        purchaseRequest: { select: { title: true } },
      },
    }),
  ]);

  return owners.map((owner) => {
    const rawEntries: Omit<UserUsdWalletEntry, "balanceAfterUsd">[] = [
      ...conversions
        .filter((conversion) => conversion.createdBy === owner.id && conversion.actualReceivedUsd != null)
        .map((conversion) => ({
          id: conversion.id,
          sourceType: "CONVERSION" as const,
          direction: "IN" as const,
          title: `Quy đổi #${conversion.id.slice(-6).toUpperCase()}`,
          amountUsd: Number(conversion.actualReceivedUsd),
          occurredAt: (conversion.decidedAt ?? conversion.createdAt).toISOString(),
          status: "SUCCEEDED",
          reference: conversion.receiveTransactionId,
          note: conversion.notes,
          paymentAccountName: conversion.walletName,
          requestedUsd: Number(conversion.amountUsd),
          receivedVnd: Number(conversion.amountVnd),
        })),
      ...expenses
        .filter((transaction) => (transaction.approvedBy ?? transaction.createdBy) === owner.id)
        .map((transaction) => ({
          id: transaction.id,
          sourceType: "TRANSACTION" as const,
          direction: transaction.direction,
          title: transaction.purchaseRequest?.title ?? transaction.description.split("\n")[0] ?? "Giao dịch chi",
          amountUsd: Number(transaction.amountOriginal),
          occurredAt: transaction.transactionDate.toISOString(),
          status: transaction.status,
          reference: transaction.transactionRef,
          note: transaction.description,
          paymentAccountName: transaction.paymentAccount
            ? `${transaction.paymentAccount.accountName} - ${transaction.paymentAccount.bankName} ${transaction.paymentAccount.accountNumber}`
            : null,
          requestedUsd: null,
          receivedVnd: null,
        })),
    ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

    let runningBalance = 0;
    const entriesWithBalance = rawEntries.map((entry) => {
      if (entry.sourceType === "CONVERSION") runningBalance += entry.amountUsd;
      if (entry.sourceType === "TRANSACTION" && entry.direction === "IN") runningBalance += entry.amountUsd;
      if (entry.sourceType === "TRANSACTION" && entry.direction === "OUT") runningBalance -= entry.amountUsd;
      return { ...entry, balanceAfterUsd: runningBalance };
    });
    const totalInUsd = rawEntries
      .filter((entry) => entry.direction === "IN")
      .reduce((sum, entry) => sum + entry.amountUsd, 0);
    const totalOutUsd = rawEntries
      .filter((entry) => entry.sourceType === "TRANSACTION" && entry.direction === "OUT")
      .reduce((sum, entry) => sum + entry.amountUsd, 0);

    return {
      userId: owner.id,
      fullName: owner.fullName,
      email: owner.email,
      balanceUsd: totalInUsd - totalOutUsd,
      totalInUsd,
      totalOutUsd,
      conversionHistory: entriesWithBalance
        .filter((entry) => entry.sourceType === "CONVERSION")
        .reverse(),
      transactionHistory: entriesWithBalance
        .filter((entry) => entry.sourceType === "TRANSACTION")
        .reverse(),
    };
  });
}
