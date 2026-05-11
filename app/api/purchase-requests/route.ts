import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { mapReceiptStorageError, saveReceiptFiles } from "@/lib/receipt-storage";

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
  title: z.string().min(3),
  description: z.string().min(3),
  categoryId: z.string().min(1),
  expectedAmount: z.number().positive(),
  currencyCode: z.enum(["VND", "USD"]),
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
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      categoryId: String(formData.get("categoryId") ?? ""),
      expectedAmount: parseNumberInput(formData.get("expectedAmount")),
      currencyCode: String(formData.get("currencyCode") ?? ""),
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
  const rows = await prisma.purchaseRequest.findMany({
    where: canReadAll ? undefined : { requesterId: auth.user.id },
    include: {
      category: {
        include: {
          parent: {
            select: { name: true },
          },
        },
      },
      requester: { select: { id: true, fullName: true, email: true } },
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
          creator: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const normalizedRows = rows.map((row: (typeof rows)[number]) => ({
    ...row,
    category: row.category
      ? {
          ...row.category,
          parentName: row.category.parent?.name ?? null,
        }
      : null,
    receiptImages: row.receiptImages.map((image: (typeof row.receiptImages)[number]) => ({
      ...image,
      filePath: normalizeReceiptPath(image.filePath),
    })),
  }));

  return ok({ rows: normalizedRows });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const parsedInput = await parseCreateInput(request);
  if (!parsedInput) {
    return fail("Payload không hợp lệ", 400);
  }
  const { payload, receiptFiles } = parsedInput;

  const category = await prisma.transactionCategory.findFirst({
    where: { id: payload.categoryId, isActive: true },
  });
  if (!category) {
    return fail("Danh mục không hợp lệ", 400);
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
            role: { code: "EMPLOYEE" },
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
        categoryId: payload.categoryId,
        title: payload.title,
        description: payload.description,
        expectedAmount: payload.expectedAmount,
        currencyCode: payload.currencyCode,
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

  return ok({ row, receiptCount: savedFiles.length }, 201);
}
