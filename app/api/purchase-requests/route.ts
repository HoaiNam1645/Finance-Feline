import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";
import { notifyPurchaseRequestSubmitted } from "@/lib/telegram";
import { STAFF_ROLE_CODES } from "@/lib/roles";
import { DIEU_AM_CATEGORY_BRANCH_CODE, categoryBranchWhere, isDieuAmRole } from "@/lib/dieu-am-scope";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

function normalizeReceiptPath(filePath: string) {
  if (!filePath) return filePath;
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) return filePath;
  if (filePath.startsWith("/")) return filePath;
  if (filePath.startsWith("public/")) return `/${filePath.replace(/^public\/+/, "")}`;
  return `/${filePath}`;
}

const createSchema = z.object({
  requesterId: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).optional()),
  kind: z.enum(["PURCHASE", "COLLECTION"]).optional().default("PURCHASE"),
  title: z.string().min(3),
  description: z.string().min(3),
  categoryId: z.string().min(1),
  expectedAmount: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
  workshopEmail: z.string().trim().max(191).optional(),
  isWalletStock: z.boolean().optional().default(false),
  walletOwnerId: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().min(1).optional()),
  items: z
    .array(
      z.object({
        itemName: z.string().min(1),
        qty: z.number().positive(),
        unitPrice: z.number().positive(),
      })
    )
    .optional()
    .default([]),
});

function parseNumberInput(input: FormDataEntryValue | null) {
  const value = Number(String(input ?? ""));
  return Number.isFinite(value) ? value : NaN;
}

function normalizeTags(values: string[]) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = value.trim().replace(/\s+/g, " ").slice(0, 50);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

// Tags live in a TEXT column as a JSON array so the list endpoint can hand the UI a plain string[].
function parseStoredTags(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

async function parseCreateInput(
  request: Request
): Promise<{ payload: z.infer<typeof createSchema>; receiptFiles: File[] } | null> {
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

    const parsed = createSchema.safeParse({
      requesterId: formData.get("requesterId"),
      kind: formData.get("kind") ? String(formData.get("kind")) : undefined,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      categoryId: String(formData.get("categoryId") ?? ""),
      expectedAmount: parseNumberInput(formData.get("expectedAmount")),
      currencyCode: String(formData.get("currencyCode") ?? ""),
      tags: normalizeTags(formData.getAll("tags").map((value) => String(value))),
      workshopEmail: String(formData.get("workshopEmail") ?? "").trim() || undefined,
      isWalletStock: String(formData.get("isWalletStock") ?? "") === "true",
      walletOwnerId: formData.get("walletOwnerId"),
      items: [],
    });
    if (!parsed.success) return null;
    return { payload: parsed.data, receiptFiles };
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return null;
  return { payload: parsed.data, receiptFiles: [] };
}

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const canReadAll = auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");
  const scopedToDieuAm = isDieuAmRole(auth.user.roles) && !canReadAll;
  const rows = await prisma.purchaseRequest.findMany({
    where: scopedToDieuAm
      ? categoryBranchWhere(DIEU_AM_CATEGORY_BRANCH_CODE)
      : canReadAll
        ? undefined
        : { requesterId: auth.user.id },
    include: {
      category: {
        include: {
          parent: {
            select: { name: true, parent: { select: { name: true } } },
          },
        },
      },
      requester: { select: { id: true, fullName: true, email: true } },
      walletOwner: { select: { id: true, fullName: true } },
      items: true,
      receiptImages: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          filePath: true,
          fileName: true,
          createdAt: true,
        },
      },
      approvals: { include: { actor: { select: { fullName: true } } }, orderBy: { actedAt: "desc" } },
      currencyConversions: {
        select: {
          conversionId: true,
          conversion: {
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          createdAt: true,
          amountOriginal: true,
          currencyCode: true,
          description: true,
          notes: true,
          transactionRef: true,
          creator: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const normalizedRows = rows.map((row: (typeof rows)[number]) => ({
    ...row,
    tags: parseStoredTags(row.tags),
    walletOwnerName: row.walletOwner?.fullName ?? null,
    category: row.category
      ? {
          ...row.category,
          parentName: row.category.parent?.name ?? null,
          pathLabel: [row.category.parent?.parent?.name, row.category.parent?.name, row.category.name]
            .filter(Boolean)
            .join(" / "),
        }
      : null,
    receiptImages: row.receiptImages.map((image: (typeof row.receiptImages)[number]) => ({
      ...image,
      filePath: normalizeReceiptPath(image.filePath),
    })),
    currencyConversionCount: row.currencyConversions.length,
    currencyConversionStatus: row.currencyConversions[0]?.conversion.status ?? null,
    currencyConversions: undefined,
  }));

  return ok({ rows: normalizedRows });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }
  if (isDieuAmRole(auth.user.roles)) {
    return forbidden();
  }

  const parsedInput = await parseCreateInput(request);
  if (!parsedInput) {
    return fail("Payload không hợp lệ", 400);
  }
  const { payload, receiptFiles } = parsedInput;

  const category = await prisma.transactionCategory.findFirst({
    where: { id: payload.categoryId, isActive: true },
    include: {
      _count: { select: { children: true } },
      parent: { select: { id: true, parent: { select: { id: true } } } },
    },
  });
  if (!category) {
    return fail("Danh mục không hợp lệ", 400);
  }
  if (!category.parent?.parent) {
    return fail("Vui lòng chọn đúng danh mục cấp 3", 400);
  }
  // Only the deepest node of a branch can carry money, so totals never double-count a parent.
  if (category._count.children > 0) {
    return fail("Vui lòng chọn danh mục con ở cấp sâu nhất", 400);
  }

  const expectedCategoryType = payload.kind === "COLLECTION" ? "INCOME" : "EXPENSE";
  if (category.type !== expectedCategoryType) {
    return fail(
      payload.kind === "COLLECTION" ? "Yêu cầu thu phải chọn danh mục Thu" : "Yêu cầu mua phải chọn danh mục Chi",
      400
    );
  }

  const canAssignRequester = auth.user.roles.includes("ACCOUNTANT");
  if (payload.requesterId && !canAssignRequester) {
    return fail("Bạn không có quyền chọn nhân viên", 403);
  }

  let requesterId = auth.user.id;
  if (payload.requesterId) {
    const requester = await prisma.user.findFirst({
      where: {
        id: payload.requesterId,
        status: "ACTIVE",
        roles: {
          some: {
            role: { code: { in: [...STAFF_ROLE_CODES] } },
          },
        },
        AND: [
          {
            roles: {
              none: {
                role: { code: "ADMIN" },
              },
            },
          },
          {
            roles: {
              none: {
                role: { code: "ACCOUNTANT" },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!requester) {
      return fail("User team không hợp lệ", 400);
    }
    requesterId = requester.id;
  }

  // Wallet stock is only ever set by an Account member on their own purchase, so a forged
  // request from any other role is ignored rather than trusted.
  const callerIsAccount = auth.user.roles.includes("ACCOUNT");
  const isWalletStock =
    payload.kind === "PURCHASE" && payload.isWalletStock && callerIsAccount && requesterId === auth.user.id;

  let walletOwnerId: string | null = null;
  if (payload.walletOwnerId) {
    if (payload.kind !== "PURCHASE") {
      return fail("Chỉ yêu cầu mua mới gắn được ví Account", 400);
    }
    // Buying back from an Account wallet is a Feline-staff action; reject rather than drop
    // the link silently, otherwise the refund would never be raised.
    if (!auth.user.roles.includes("EMPLOYEE")) {
      return fail("Chỉ nhân viên Feline mới gắn được yêu cầu vào ví Account", 403);
    }
    if (payload.walletOwnerId === requesterId) {
      return fail("Không thể mua lại từ ví của chính mình", 400);
    }
    const walletOwner = await prisma.user.findFirst({
      where: {
        id: payload.walletOwnerId,
        status: "ACTIVE",
        roles: { some: { role: { code: "ACCOUNT" } } },
      },
      select: { id: true },
    });
    if (!walletOwner) {
      return fail("Ví Account không hợp lệ", 400);
    }
    walletOwnerId = walletOwner.id;
  }

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

  const row = await prisma.$transaction(async (tx: TxClient) => {
    const created = await tx.purchaseRequest.create({
      data: {
        requesterId,
        kind: payload.kind,
        categoryId: payload.categoryId,
        title: payload.title,
        description: payload.description,
        expectedAmount: payload.expectedAmount,
        currencyCode: payload.currencyCode,
        tags: payload.tags.length ? JSON.stringify(normalizeTags(payload.tags)) : null,
        workshopEmail: payload.workshopEmail ?? null,
        isWalletStock,
        walletOwnerId,
        status: "PENDING_APPROVAL",
        ...(payload.items.length > 0
          ? {
              items: {
                create: payload.items.map((item: (typeof payload.items)[number]) => ({
                  itemName: item.itemName,
                  qty: item.qty,
                  unitPrice: item.unitPrice,
                  currencyCode: payload.currencyCode,
                  subtotal: item.qty * item.unitPrice,
                })),
              },
            }
          : {}),
      },
      include: { items: true, category: true },
    });

    if (savedFiles.length > 0) {
      await tx.receiptImage.createMany({
        data: savedFiles.map((file) => ({
          purchaseRequestId: created.id,
          uploadedBy: auth.user.id,
          filePath: file.filePath,
          fileName: file.fileName,
          mimeType: file.mimeType,
          size: file.size,
        })),
      });
    }

    return created;
  });

  await writeAuditLog({
    actor: auth.user,
    action: "purchase_request.create",
    entityType: "purchase_request",
    entityId: row.id,
    afterData: {
      ...row,
      receiptCount: savedFiles.length,
    },
  });

  await notifyPurchaseRequestSubmitted(row.id).catch((error) => {
    console.error("[telegram] purchase request notification failed", error);
  });

  return ok({ row, receiptCount: savedFiles.length }, 201);
}
