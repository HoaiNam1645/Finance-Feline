import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type TransactionNote = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

function parseNotes(value: unknown): TransactionNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        typeof row.content !== "string" ||
        typeof row.createdAt !== "string" ||
        typeof row.authorId !== "string" ||
        typeof row.authorName !== "string"
      ) {
        return null;
      }
      return {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        authorId: row.authorId,
        authorName: row.authorName,
      };
    })
    .filter((item): item is TransactionNote => item !== null);
}

function normalizeReceiptPath(filePath: string) {
  if (!filePath) return filePath;
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) return filePath;
  if (filePath.startsWith("/")) return filePath;
  if (filePath.startsWith("public/")) return `/${filePath.replace(/^public\/+/, "")}`;
  return `/${filePath}`;
}

const schema = z.object({
  teamUserIds: z.array(z.string().min(1)).optional(),
  paymentAccountId: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).optional()),
  categoryId: z.string().min(1),
  amountOriginal: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
  description: z.string().min(3),
  transactionDate: z.string().datetime().optional(),
});

type CreatePayload = z.infer<typeof schema>;

function parseNumberInput(input: FormDataEntryValue | null) {
  const value = Number(String(input ?? ""));
  return Number.isFinite(value) ? value : NaN;
}

async function parseCreateInput(request: Request): Promise<{ payload: CreatePayload; receiptFiles: File[] } | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const incoming = formData.getAll("receiptFiles");
    const receiptFiles: File[] = [];
    for (const item of incoming) {
      if (item instanceof File && item.size > 0) {
        receiptFiles.push(item);
      }
    }

    const teamUserIds = formData
      .getAll("teamUserIds")
      .map((value) => String(value))
      .filter((value) => value.length > 0);

    const parsed = schema.safeParse({
      teamUserIds,
      paymentAccountId: formData.get("paymentAccountId"),
      categoryId: String(formData.get("categoryId") ?? ""),
      amountOriginal: parseNumberInput(formData.get("amountOriginal")),
      currencyCode: String(formData.get("currencyCode") ?? ""),
      description: String(formData.get("description") ?? ""),
      transactionDate: formData.get("transactionDate") ? String(formData.get("transactionDate")) : undefined,
    });
    if (!parsed.success) return null;
    return { payload: parsed.data, receiptFiles };
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return null;
  return { payload: parsed.data, receiptFiles: [] };
}

export async function GET(request: Request) {
  const auth = await requireApiUser("transaction.read");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }
  const canReadAllTransactions = auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const qParam = searchParams.get("q")?.trim() ?? "";
  const directionParam = searchParams.get("direction");
  const teamUserIdParam = searchParams.get("teamUserId");
  const categoryIdParam = searchParams.get("categoryId");
  const adjustedParam = searchParams.get("adjusted");
  const paymentAccountIdParam = searchParams.get("paymentAccountId");

  const fromDate = fromParam ? new Date(`${fromParam}T00:00:00.000`) : null;
  const toDate = toParam ? new Date(`${toParam}T23:59:59.999`) : null;
  const hasFromDate = Boolean(fromDate && !Number.isNaN(fromDate.getTime()));
  const hasToDate = Boolean(toDate && !Number.isNaN(toDate.getTime()));
  const where = {
    ...(hasFromDate || hasToDate
      ? {
          transactionDate: {
            ...(hasFromDate ? { gte: fromDate! } : {}),
            ...(hasToDate ? { lte: toDate! } : {}),
          },
        }
      : {}),
    ...(directionParam === "IN" || directionParam === "OUT" ? { direction: directionParam } : {}),
    ...(canReadAllTransactions
      ? teamUserIdParam && teamUserIdParam !== "__ALL__"
        ? teamUserIdParam === "__UNASSIGNED__"
          ? { teamUsers: { none: {} } }
          : { teamUsers: { some: { userId: teamUserIdParam } } }
        : {}
      : { teamUsers: { some: { userId: auth.user.id } } }),
    ...(categoryIdParam && categoryIdParam !== "__ALL__" ? { categoryId: categoryIdParam } : {}),
    ...(paymentAccountIdParam && paymentAccountIdParam !== "__ALL__"
      ? paymentAccountIdParam === "__NONE__"
        ? { paymentAccountId: null }
        : { paymentAccountId: paymentAccountIdParam }
      : {}),
    ...(adjustedParam === "YES"
      ? { adjustments: { some: {} } }
      : adjustedParam === "NO"
        ? { adjustments: { none: {} } }
        : {}),
    ...(qParam
      ? {
          OR: [
            { description: { contains: qParam } },
            { category: { name: { contains: qParam } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.transaction.findMany({
    where: where as any,
    include: {
      category: {
        select: {
          id: true,
          name: true,
          type: true,
          parent: {
            select: { name: true },
          },
        },
      },
      teamUsers: {
        select: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      },
      creator: { select: { fullName: true } },
      paymentAccount: {
        select: {
          id: true,
          accountName: true,
          bankName: true,
          accountNumber: true,
          ownerName: true,
        },
      },
      receiptImages: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filePath: true,
          fileName: true,
          createdAt: true,
        },
      },
      purchaseRequest: {
        select: {
          receiptImages: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              filePath: true,
              fileName: true,
              createdAt: true,
            },
          },
        },
      },
      adjustments: {
        orderBy: { requestedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          requestedAt: true,
          decidedAt: true,
        },
      },
      _count: {
        select: {
          adjustments: true,
        },
      },
    },
    orderBy: { transactionDate: "desc" },
  });

  const transactionIds = rows.map((row: (typeof rows)[number]) => row.id);
  const purchaseRequestIds = rows
    .map((row: (typeof rows)[number]) => row.purchaseRequestId)
    .filter((id: string | null): id is string => Boolean(id));
  const latestAuditRows = transactionIds.length
    ? await prisma.auditLog.findMany({
        where: {
          entityType: "transaction",
          entityId: { in: transactionIds },
        },
        orderBy: [{ entityId: "asc" }, { createdAt: "desc" }],
        select: {
          entityId: true,
          action: true,
          createdAt: true,
        },
      })
    : [];
  const txAuditCountRows = transactionIds.length
    ? await prisma.auditLog.groupBy({
        by: ["entityId"],
        where: {
          entityType: "transaction",
          entityId: { in: transactionIds },
        },
        _count: { _all: true },
      })
    : [];
  const requestAuditCountRows = purchaseRequestIds.length
    ? await prisma.auditLog.groupBy({
        by: ["entityId"],
        where: {
          entityType: "purchase_request",
          entityId: { in: purchaseRequestIds },
        },
        _count: { _all: true },
      })
    : [];

  const latestAuditByEntity = new Map<string, { action: string; createdAt: Date }>();
  for (const row of latestAuditRows as Array<(typeof latestAuditRows)[number]>) {
    if (!latestAuditByEntity.has(row.entityId)) {
      latestAuditByEntity.set(row.entityId, { action: row.action, createdAt: row.createdAt });
    }
  }
  const txAuditCountByEntity = new Map<string, number>();
  for (const row of txAuditCountRows) {
    txAuditCountByEntity.set(row.entityId, row._count._all);
  }
  const requestAuditCountByEntity = new Map<string, number>();
  for (const row of requestAuditCountRows) {
    requestAuditCountByEntity.set(row.entityId, row._count._all);
  }

  const normalizedRows = rows.map((row: (typeof rows)[number]) => ({
    ...row,
    category: {
      id: row.category.id,
      name: row.category.name,
      type: row.category.type,
      parentName: row.category.parent?.name ?? null,
    },
    teamUsers: row.teamUsers.map((link: (typeof row.teamUsers)[number]) => link.user),
    notes: parseNotes(row.notes),
    receiptImages: (row.receiptImages.length > 0 ? row.receiptImages : row.purchaseRequest?.receiptImages ?? []).map((image: {
      id: string;
      filePath: string;
      fileName: string;
      createdAt: Date;
    }) => ({
        ...image,
        filePath: normalizeReceiptPath(image.filePath),
      }),
    ),
    latestActivity: latestAuditByEntity.get(row.id) ?? null,
    latestAdjustment: row.adjustments[0] ?? null,
    adjustmentCount: row._count.adjustments,
    timelineCount:
      (txAuditCountByEntity.get(row.id) ?? 0) +
      (row.purchaseRequestId ? (requestAuditCountByEntity.get(row.purchaseRequestId) ?? 0) : 0),
  }));

  return ok({ rows: normalizedRows });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("transaction.create");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const parsedInput = await parseCreateInput(request);
  if (!parsedInput) {
    return fail("Payload không hợp lệ", 400);
  }
  const { payload, receiptFiles } = parsedInput;

  const category = await prisma.transactionCategory.findFirst({
    where: {
      id: payload.categoryId,
      isActive: true,
    },
    select: { id: true, type: true },
  });
  if (!category) {
    return fail("Danh mục không hợp lệ", 400);
  }

  const teamUserIds = Array.from(new Set(payload.teamUserIds ?? []));
  if (teamUserIds.length > 0) {
    const activeTeamUsers = await prisma.user.findMany({
      where: {
        id: { in: teamUserIds },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (activeTeamUsers.length !== teamUserIds.length) {
      return fail("User team không hợp lệ", 400);
    }
  }

  if (payload.paymentAccountId) {
    const paymentAccount = await prisma.paymentAccount.findFirst({
      where: {
        id: payload.paymentAccountId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!paymentAccount) {
      return fail("Tài khoản thanh toán không hợp lệ", 400);
    }
  }

  const direction = category.type === "INCOME" ? "IN" : "OUT";

  let savedFiles: Array<{ filePath: string; fileName: string; mimeType: string; size: number }> = [];
  try {
    savedFiles = await saveReceiptFiles(receiptFiles);
  } catch (error) {
    const message = mapReceiptStorageError(error);
    if (message) {
      return fail(message, 400);
    }
    throw error;
  }

  const fx = payload.currencyCode === "USD" ? env.defaultUsdToVnd : 1;
  const amountVnd = payload.amountOriginal * fx;

  const result = await prisma.$transaction(async (tx: TxClient) => {
    const row = await tx.transaction.create({
      data: {
        direction,
        ...(teamUserIds.length > 0
          ? { teamUsers: { create: teamUserIds.map((userId) => ({ userId })) } }
          : {}),
        paymentAccountId: payload.paymentAccountId ?? null,
        categoryId: payload.categoryId,
        amountOriginal: payload.amountOriginal,
        currencyCode: payload.currencyCode,
        exchangeRateToVnd: fx,
        amountVnd,
        description: payload.description,
        notes: [],
        transactionDate: payload.transactionDate
          ? new Date(payload.transactionDate)
          : new Date(),
        paymentMethod: "SYSTEM_DEFAULT",
        createdBy: auth.user.id,
        approvedBy: auth.user.id,
      },
    });

    if (savedFiles.length > 0) {
      await tx.receiptImage.createMany({
        data: savedFiles.map((file) => ({
          ...(row.purchaseRequestId ? { purchaseRequestId: row.purchaseRequestId } : {}),
          transactionId: row.id,
          uploadedBy: auth.user.id,
          filePath: file.filePath,
          fileName: file.fileName,
          mimeType: file.mimeType,
          size: file.size,
        })),
      });
    }

    return row;
  });

  await writeAuditLog({
    actor: auth.user,
    action: "transaction.create",
    entityType: "transaction",
    entityId: result.id,
    afterData: {
      ...result,
      receiptCount: savedFiles.length,
    },
  });

  return ok({ row: result, receiptCount: savedFiles.length }, 201);
}
