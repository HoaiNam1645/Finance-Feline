import type { SessionUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  approvePurchaseRequest,
  PurchaseRequestActionError,
  rejectPurchaseRequest,
} from "@/lib/purchase-request-actions";

type TelegramInlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: {
    chat?: { id?: number | string };
    message_id?: number;
  };
};

type TelegramUpdate = {
  update_id?: number;
  callback_query?: TelegramCallbackQuery;
};

const TELEGRAM_MEDIA_GROUP_LIMIT = 10;

function telegramEnabled() {
  return Boolean(env.telegramBotToken && env.telegramChatId);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: unknown, currencyCode: string) {
  return `${Number(value).toLocaleString("vi-VN")} ${currencyCode}`;
}

function formatDate(value: Date) {
  return value.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  if (!env.telegramBotToken) return null;

  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[telegram] api failed", method, response.status, data);
    return null;
  }
  return data;
}

async function getTelegramUpdates(offset: number | null) {
  const data = await telegramApi("getUpdates", {
    ...(offset == null ? {} : { offset }),
    timeout: 20,
    allowed_updates: ["callback_query"],
  });
  if (!data || typeof data !== "object" || !("ok" in data) || data.ok !== true || !Array.isArray(data.result)) {
    return [];
  }
  return data.result as TelegramUpdate[];
}

async function getRequestForTelegram(id: string) {
  return prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { fullName: true, email: true } },
      category: {
        include: {
          parent: { select: { name: true } },
        },
      },
      receiptImages: {
        orderBy: { createdAt: "desc" },
        select: { fileName: true, filePath: true },
      },
    },
  });
}

function categoryName(request: NonNullable<Awaited<ReturnType<typeof getRequestForTelegram>>>) {
  if (!request.category) return "Chưa chọn";
  if (request.category.parent?.name) {
    return `${request.category.parent.name} / ${request.category.name}`;
  }
  return request.category.name;
}

function buildRequestMessage(request: NonNullable<Awaited<ReturnType<typeof getRequestForTelegram>>>) {
  const kindLabel = request.kind === "COLLECTION" ? "Yêu cầu thu" : "Yêu cầu mua/chi";
  const title = escapeHtml(request.title);
  const description = escapeHtml(request.description || "-");
  const requester = escapeHtml(`${request.requester.fullName} (${request.requester.email})`);
  const category = escapeHtml(categoryName(request));
  const receiptLine =
    request.receiptImages.length > 0
      ? `\n🧾 <b>Chứng từ:</b> ${request.receiptImages.length} file`
      : "";
  const appLink = `${env.appUrl.replace(/\/$/, "")}/purchase-requests`;

  return [
    `📣 <b>${kindLabel} mới</b> <code>#${request.id.slice(-6).toUpperCase()}</code>`,
    "━━━━━━━━━━━━━━━━━━━━",
    `👤 <b>Người tạo:</b> ${requester}`,
    `🏷 <b>Danh mục:</b> ${category}`,
    `💰 <b>Số tiền:</b> <code>${money(request.expectedAmount, request.currencyCode)}</code>`,
    `🧾 <b>Tiêu đề:</b> ${title}`,
    `📝 <b>Mô tả:</b> ${description}`,
    `📅 <b>Ngày tạo:</b> ${formatDate(request.createdAt)}${receiptLine}`,
    "━━━━━━━━━━━━━━━━━━━━",
    `⏳ <b>Trạng thái:</b> ${request.status}`,
    `🔗 <a href="${escapeHtml(appLink)}">Mở trong hệ thống</a>`,
  ].join("\n");
}

function buildApprovalKeyboard(requestId: string): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `pr:approve:${requestId}` },
        { text: "❌ Reject", callback_data: `pr:reject:${requestId}` },
      ],
    ],
  };
}

function absoluteReceiptUrl(filePath: string) {
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }

  const appUrl = env.appUrl.replace(/\/$/, "");
  if (filePath.startsWith("/")) {
    return `${appUrl}${filePath}`;
  }
  if (filePath.startsWith("public/")) {
    return `${appUrl}/${filePath.replace(/^public\/+/, "")}`;
  }
  return `${appUrl}/${filePath}`;
}

function receiptCaption(
  request: NonNullable<Awaited<ReturnType<typeof getRequestForTelegram>>>,
  start: number,
  count: number
) {
  const end = start + count - 1;
  const range = request.receiptImages.length === 1 ? "1/1" : `${start}-${end}/${request.receiptImages.length}`;
  return `🧾 <b>Chứng từ</b> <code>#${escapeHtml(request.id.slice(-6).toUpperCase())}</code> (${range})`;
}

async function sendSingleReceiptImage(
  request: NonNullable<Awaited<ReturnType<typeof getRequestForTelegram>>>,
  image: { fileName: string; filePath: string },
  index: number
) {
  return telegramApi("sendPhoto", {
    chat_id: env.telegramChatId,
    photo: absoluteReceiptUrl(image.filePath),
    caption: `${receiptCaption(request, index, 1)}\n${escapeHtml(image.fileName)}`,
    parse_mode: "HTML",
  });
}

async function sendReceiptImages(request: NonNullable<Awaited<ReturnType<typeof getRequestForTelegram>>>) {
  if (request.receiptImages.length === 0) return;

  if (request.receiptImages.length === 1) {
    await sendSingleReceiptImage(request, request.receiptImages[0], 1);
    return;
  }

  for (let index = 0; index < request.receiptImages.length; index += TELEGRAM_MEDIA_GROUP_LIMIT) {
    const batch = request.receiptImages.slice(index, index + TELEGRAM_MEDIA_GROUP_LIMIT);
    const result = await telegramApi("sendMediaGroup", {
      chat_id: env.telegramChatId,
      media: batch.map((image, batchIndex) => ({
        type: "photo",
        media: absoluteReceiptUrl(image.filePath),
        ...(batchIndex === 0
          ? {
              caption: receiptCaption(request, index + 1, batch.length),
              parse_mode: "HTML",
            }
          : {}),
      })),
    });

    if (!result) {
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        await sendSingleReceiptImage(request, batch[batchIndex], index + batchIndex + 1);
      }
    }
  }
}

export async function notifyPurchaseRequestSubmitted(requestId: string) {
  if (!telegramEnabled()) {
    console.log("[telegram] skipped purchase request notification: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }

  const request = await getRequestForTelegram(requestId);
  if (!request) return;

  await sendReceiptImages(request).catch((error) => {
    console.error("[telegram] receipt images notification failed", error);
  });

  await telegramApi("sendMessage", {
    chat_id: env.telegramChatId,
    text: buildRequestMessage(request),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildApprovalKeyboard(request.id),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false) {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

async function editCallbackMessage(callback: TelegramCallbackQuery, text: string) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  if (!chatId || !messageId) return;

  await telegramApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}

export async function getTelegramApprovalActor(): Promise<SessionUser | null> {
  const where = env.telegramApproverEmail
    ? {
        email: env.telegramApproverEmail,
        status: "ACTIVE" as const,
      }
    : {
        status: "ACTIVE" as const,
        roles: {
          some: {
            role: { code: "ADMIN" },
          },
        },
      };

  const user = await prisma.user.findFirst({
    where,
    include: {
      roles: {
        include: { role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map((entry) => entry.role.code),
  };
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback?.id || !callback.data) {
    return { handled: false };
  }

  const match = callback.data.match(/^pr:(approve|reject):(.+)$/);
  if (!match) {
    await answerCallbackQuery(callback.id, "Hành động không hợp lệ", true);
    return { handled: false };
  }

  const [, action, requestId] = match;
  const actor = await getTelegramApprovalActor();
  if (!actor) {
    await answerCallbackQuery(callback.id, "Chưa cấu hình người duyệt Telegram", true);
    return { handled: true, ok: false };
  }

  try {
    if (action === "approve") {
      await approvePurchaseRequest({
        id: requestId,
        actor,
        note: "Đồng ý duyệt từ Telegram",
        auditAction: "purchase_request.telegram_approve",
      });
      await answerCallbackQuery(callback.id, "Đã duyệt");
      await editCallbackMessage(callback, `✅ <b>Đã duyệt</b> yêu cầu <code>#${escapeHtml(requestId.slice(-6).toUpperCase())}</code> bởi ${escapeHtml(actor.fullName)}`);
      return { handled: true, ok: true };
    }

    await rejectPurchaseRequest({
      id: requestId,
      actor,
      note: "Từ chối từ Telegram",
      auditAction: "purchase_request.telegram_reject",
    });
    await answerCallbackQuery(callback.id, "Đã từ chối");
    await editCallbackMessage(callback, `❌ <b>Đã từ chối</b> yêu cầu <code>#${escapeHtml(requestId.slice(-6).toUpperCase())}</code> bởi ${escapeHtml(actor.fullName)}`);
    return { handled: true, ok: true };
  } catch (error) {
    const message = error instanceof PurchaseRequestActionError ? error.message : "Xử lý thất bại";
    await answerCallbackQuery(callback.id, message, true);
    return { handled: true, ok: false, error: message };
  }
}

export function startTelegramPolling() {
  if (!env.telegramBotToken) {
    console.log("[telegram] polling disabled: missing TELEGRAM_BOT_TOKEN");
    return;
  }

  let offset: number | null = null;
  let stopped = false;
  let running = false;

  async function poll() {
    if (stopped || running) return;
    running = true;
    try {
      const updates = await getTelegramUpdates(offset);
      for (const update of updates) {
        if (typeof update.update_id === "number") {
          offset = update.update_id + 1;
        }
        await handleTelegramUpdate(update);
      }
    } catch (error) {
      console.error("[telegram] polling failed", error);
    } finally {
      running = false;
      if (!stopped) {
        setTimeout(poll, 1000);
      }
    }
  }

  console.log("[telegram] polling started");
  void poll();

  return () => {
    stopped = true;
  };
}
