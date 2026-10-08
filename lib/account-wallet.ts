import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const WALLET_REFUND_CATEGORY_CODE = "INCOME_ACCOUNT_WALLET";
export const WALLET_REFUND_CATEGORY_NAME = "Hoàn ví Account";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

function toVnd(amount: number, currencyCode: string) {
  return currencyCode === "USD" ? amount * env.defaultUsdToVnd : amount;
}

/** The income category every auto-generated wallet refund is booked under. */
export async function ensureWalletRefundCategory(tx: TxClient = prisma) {
  const existing = await tx.transactionCategory.findUnique({
    where: { code: WALLET_REFUND_CATEGORY_CODE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.transactionCategory.create({
    data: {
      code: WALLET_REFUND_CATEGORY_CODE,
      name: WALLET_REFUND_CATEGORY_NAME,
      type: "INCOME",
      accountantApprovalThresholdVnd: 50_000_000,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Raised once the buy-back request has actually been paid: the amount that left the
 * company is what the Account member gets credited, so the wallet never drifts from
 * the ledger. The collection request still has to be approved before it counts.
 */
export async function createWalletRefundRequest(
  tx: TxClient,
  input: {
    sourceRequestId: string;
    walletOwnerId: string;
    amountVnd: number;
    sourceTitle: string;
    buyerName: string;
  }
) {
  if (input.amountVnd <= 0) return null;

  const alreadyRaised = await tx.purchaseRequest.findFirst({
    where: { walletSourceRequestId: input.sourceRequestId },
    select: { id: true },
  });
  if (alreadyRaised) return null;

  const categoryId = await ensureWalletRefundCategory(tx);

  return tx.purchaseRequest.create({
    data: {
      requesterId: input.walletOwnerId,
      categoryId,
      kind: "COLLECTION",
      title: `Hoàn ví: ${input.sourceTitle}`,
      description: `Tự động tạo từ yêu cầu mua của ${input.buyerName}. Số tiền theo đúng khoản đã chuyển thực tế.`,
      expectedAmount: input.amountVnd,
      currencyCode: "VND",
      status: "PENDING_APPROVAL",
      walletSourceRequestId: input.sourceRequestId,
    },
  });
}

export type AccountWalletEntry = {
  id: string;
  kind: "DEBIT" | "CREDIT";
  title: string;
  amountVnd: number;
  occurredAt: string;
  status: string;
  counterpartName: string | null;
};

export type AccountWalletSummary = {
  userId: string;
  fullName: string;
  email: string;
  debitVnd: number;
  creditVnd: number;
  balanceVnd: number;
  entries: AccountWalletEntry[];
};

/**
 * Debits are what actually left the company for the member's wallet stock; credits are
 * the refund requests other staff triggered, counted from the moment they are approved.
 */
export async function getAccountWallets(userIds?: string[]): Promise<AccountWalletSummary[]> {
  const owners = await prisma.user.findMany({
    where: {
      ...(userIds?.length ? { id: { in: userIds } } : {}),
      roles: { some: { role: { code: "ACCOUNT" } } },
    },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, email: true },
  });
  if (!owners.length) return [];

  const ownerIds = owners.map((owner) => owner.id);

  const [stockRequests, refundRequests] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: { requesterId: { in: ownerIds }, isWalletStock: true },
      select: {
        id: true,
        title: true,
        status: true,
        requesterId: true,
        transactions: { select: { id: true, amountVnd: true, transactionDate: true } },
      },
    }),
    prisma.purchaseRequest.findMany({
      where: {
        requesterId: { in: ownerIds },
        walletSourceRequestId: { not: null },
        status: { in: ["APPROVED", "PAID"] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        requesterId: true,
        expectedAmount: true,
        currencyCode: true,
        updatedAt: true,
        walletSourceRequest: { select: { requester: { select: { fullName: true } } } },
      },
    }),
  ]);

  return owners.map((owner) => {
    const entries: AccountWalletEntry[] = [];
    let debitVnd = 0;
    let creditVnd = 0;

    for (const request of stockRequests) {
      if (request.requesterId !== owner.id) continue;
      for (const transaction of request.transactions) {
        const amount = Number(transaction.amountVnd);
        debitVnd += amount;
        entries.push({
          id: transaction.id,
          kind: "DEBIT",
          title: request.title,
          amountVnd: amount,
          occurredAt: transaction.transactionDate.toISOString(),
          status: request.status,
          counterpartName: null,
        });
      }
    }

    for (const request of refundRequests) {
      if (request.requesterId !== owner.id) continue;
      const amount = toVnd(Number(request.expectedAmount), request.currencyCode);
      creditVnd += amount;
      entries.push({
        id: request.id,
        kind: "CREDIT",
        title: request.title,
        amountVnd: amount,
        occurredAt: request.updatedAt.toISOString(),
        status: request.status,
        counterpartName: request.walletSourceRequest?.requester.fullName ?? null,
      });
    }

    entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return {
      userId: owner.id,
      fullName: owner.fullName,
      email: owner.email,
      debitVnd: Math.round(debitVnd),
      creditVnd: Math.round(creditVnd),
      balanceVnd: Math.round(creditVnd - debitVnd),
      entries,
    };
  });
}
