import type { SessionUser } from "@/lib/auth";
import {
  CurrencyConversionActionError,
  updateCurrencyConversionStatus,
} from "@/lib/currency-conversion-actions";
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
    caption?: string;
    photo?: unknown[];
  };
};

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number | string };
  reply_to_message?: {
    text?: string;
  };
};

type TelegramUpdate = {
  update_id?: number;
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

const TELEGRAM_MEDIA_GROUP_LIMIT = 10;
const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;
const REJECT_REASON_MAX_LENGTH = 500;
const TELEGRAM_SEPARATOR = "------------------------------";

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

function currencyConversionStatusLabel(status: string) {
  if (status === "SUCCEEDED") return "Thành công";
  if (status === "FAILED") return "Thất bại";
  return "Đang chờ";
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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
    allowed_updates: ["callback_query", "message", "channel_post"],
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

async function getCurrencyConversionForTelegram(id: string) {
  return prisma.currencyConversion.findUnique({
    where: { id },
    include: {
      creator: { select: { fullName: true, email: true } },
      decider: { select: { fullName: true, email: true } },
      walletPaymentAccount: {
        select: {
          accountName: true,
          bankName: true,
          accountNumber: true,
          ownerName: true,
        },
      },
      requests: {
        include: {
          purchaseRequest: {
            select: {
              id: true,
              title: true,
              expectedAmount: true,
              currencyCode: true,
              requester: { select: { fullName: true } },
            },
          },
        },
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
      ? `\n<b>Chứng từ:</b> ${request.receiptImages.length} file`
      : "";
  const appLink = `${env.appUrl.replace(/\/$/, "")}/purchase-requests`;

  return [
    `<b>${kindLabel} mới</b> <code>#${request.id.slice(-6).toUpperCase()}</code>`,
    TELEGRAM_SEPARATOR,
    `<b>Người tạo:</b> ${requester}`,
    `<b>Danh mục:</b> ${category}`,
    `<b>Số tiền:</b> <code>${money(request.expectedAmount, request.currencyCode)}</code>`,
    `<b>Tiêu đề:</b> ${title}`,
    `<b>Mô tả:</b> ${description}`,
    `<b>Ngày tạo:</b> ${formatDate(request.createdAt)}${receiptLine}`,
    TELEGRAM_SEPARATOR,
    `<b>Trạng thái:</b> ${request.status}`,
    `<a href="${escapeHtml(appLink)}">Mở trong hệ thống</a>`,
  ].join("\n");
}

function buildApprovalKeyboard(requestId: string): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Duyệt", callback_data: `pr:approve:${requestId}` },
        { text: "Từ chối", callback_data: `pr:reject:${requestId}` },
      ],
    ],
  };
}

function buildCurrencyConversionKeyboard(conversionId: string): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Thành công", callback_data: `cc:succeeded:${conversionId}` },
        { text: "Thất bại", callback_data: `cc:failed:${conversionId}` },
      ],
    ],
  };
}

function buildCurrencyConversionMessage(
  conversion: NonNullable<Awaited<ReturnType<typeof getCurrencyConversionForTelegram>>>,
  options: { compactForCaption?: boolean } = {}
) {
  const compact = options.compactForCaption;
  const visibleRequests = compact ? conversion.requests.slice(0, 4) : conversion.requests;
  const requestLines = conversion.requests.length
    ? visibleRequests
        .map((item, index) => {
          const request = item.purchaseRequest;
          const title = compact ? truncateText(request.title, 42) : request.title;
          return `${index + 1}. ${escapeHtml(title)} - <code>${money(
            request.expectedAmount,
            request.currencyCode
          )}</code>`;
        })
        .concat(
          compact && conversion.requests.length > visibleRequests.length
            ? [`… và ${conversion.requests.length - visibleRequests.length} yêu cầu khác`]
            : []
        )
        .join("\n")
    : "-";
  const deciderLine = conversion.decider
    ? `\n<b>Người cập nhật:</b> ${escapeHtml(
        compact ? conversion.decider.fullName : `${conversion.decider.fullName} (${conversion.decider.email})`
      )}`
    : "";
  const decidedAtLine = conversion.decidedAt ? `\n<b>Cập nhật lúc:</b> ${formatDate(conversion.decidedAt)}` : "";
  const walletAccount = conversion.walletPaymentAccount;
  const walletLine = walletAccount
    ? `${walletAccount.accountName} - ${walletAccount.accountNumber}`
    : conversion.walletName;
  const appLink = `${env.appUrl.replace(/\/$/, "")}/currency-conversions`;

  const lines = [
    `<b>Lệnh quy đổi tiền tệ</b> <code>#${conversion.id.slice(-6).toUpperCase()}</code>`,
    TELEGRAM_SEPARATOR,
    `<b>Ví PingPong:</b> ${escapeHtml(compact ? truncateText(walletLine, 54) : walletLine)}`,
    `<b>Ngân hàng nhận:</b> ${escapeHtml(compact ? truncateText(conversion.bankName, 48) : conversion.bankName)}`,
    `<b>Số tài khoản:</b> <code>${escapeHtml(
      compact ? truncateText(conversion.accountNumber, 32) : conversion.accountNumber
    )}</code>`,
    `<b>Chủ tài khoản:</b> ${escapeHtml(compact ? truncateText(conversion.ownerName, 48) : conversion.ownerName)}`,
    `<b>Số tiền quy đổi:</b> <code>${money(conversion.amountUsd, "USD")}</code>`,
    `<b>Số tiền nhận:</b> <code>${money(conversion.amountVnd, "VND")}</code>`,
    ...(conversion.transferTransactionId
      ? [`<b>Mã giao dịch chuyển:</b> <code>${escapeHtml(conversion.transferTransactionId)}</code>`]
      : []),
    ...(conversion.receiveTransactionId
      ? [`<b>Mã giao dịch nhận:</b> <code>${escapeHtml(conversion.receiveTransactionId)}</code>`]
      : []),
    ...(conversion.notes
      ? [`<b>Notes:</b> ${escapeHtml(compact ? truncateText(conversion.notes, 120) : conversion.notes)}`]
      : []),
    `<b>Yêu cầu mua gắn kèm:</b>\n${requestLines}`,
    TELEGRAM_SEPARATOR,
    `<b>Trạng thái:</b> ${currencyConversionStatusLabel(conversion.status)}`,
    `<b>Người tạo:</b> ${escapeHtml(
      compact ? conversion.creator.fullName : `${conversion.creator.fullName} (${conversion.creator.email})`
    )}`,
    `<b>Ngày tạo:</b> ${formatDate(conversion.createdAt)}${deciderLine}${decidedAtLine}`,
    `<a href="${escapeHtml(appLink)}">Mở trong hệ thống</a>`,
  ];

  if (!compact) {
    return lines.join("\n");
  }

  const caption = lines.join("\n");
  if (caption.length <= TELEGRAM_PHOTO_CAPTION_LIMIT) {
    return caption;
  }

  return [
    `<b>Lệnh quy đổi tiền tệ</b> <code>#${conversion.id.slice(-6).toUpperCase()}</code>`,
    TELEGRAM_SEPARATOR,
    `<b>Ví PingPong:</b> ${escapeHtml(truncateText(walletLine, 44))}`,
    `<b>Ngân hàng nhận:</b> ${escapeHtml(truncateText(conversion.bankName, 40))}`,
    `<b>Chủ tài khoản:</b> ${escapeHtml(truncateText(conversion.ownerName, 40))}`,
    `<b>Số tiền quy đổi:</b> <code>${money(conversion.amountUsd, "USD")}</code>`,
    `<b>Yêu cầu mua gắn kèm:</b> ${conversion.requests.length} yêu cầu`,
    TELEGRAM_SEPARATOR,
    `<b>Trạng thái:</b> ${currencyConversionStatusLabel(conversion.status)}`,
    `<a href="${escapeHtml(appLink)}">Mở trong hệ thống</a>`,
  ].join("\n");
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
  return `<b>Chứng từ</b> <code>#${escapeHtml(request.id.slice(-6).toUpperCase())}</code> (${range})`;
}

async function sendReceiptImage(
  request: NonNullable<Awaited<ReturnType<typeof getRequestForTelegram>>>,
  image: { fileName: string; filePath: string },
  index: number,
  caption?: string,
  replyMarkup?: TelegramInlineKeyboard
) {
  return telegramApi("sendPhoto", {
    chat_id: env.telegramChatId,
    photo: absoluteReceiptUrl(image.filePath),
    caption: caption ?? `${receiptCaption(request, index, 1)}\n${escapeHtml(image.fileName)}`,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendExtraReceiptImages(
  request: NonNullable<Awaited<ReturnType<typeof getRequestForTelegram>>>,
  startIndex: number
) {
  for (let index = startIndex; index < request.receiptImages.length; index += TELEGRAM_MEDIA_GROUP_LIMIT) {
    const batch = request.receiptImages.slice(index, index + TELEGRAM_MEDIA_GROUP_LIMIT);
    if (batch.length === 1) {
      await sendReceiptImage(request, batch[0], index + 1);
      continue;
    }

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
        await sendReceiptImage(request, batch[batchIndex], index + batchIndex + 1);
      }
    }
  }
}

async function sendCurrencyConversionPhotoNotification(
  conversion: NonNullable<Awaited<ReturnType<typeof getCurrencyConversionForTelegram>>>
) {
  return telegramApi("sendPhoto", {
    chat_id: env.telegramChatId,
    photo: absoluteReceiptUrl(conversion.pingpongImagePath),
    caption: buildCurrencyConversionMessage(conversion, { compactForCaption: true }),
    parse_mode: "HTML",
    reply_markup: buildCurrencyConversionKeyboard(conversion.id),
  });
}

export async function notifyPurchaseRequestSubmitted(requestId: string) {
  if (!telegramEnabled()) {
    console.log("[telegram] skipped purchase request notification: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }

  const request = await getRequestForTelegram(requestId);
  if (!request) return;

  if (request.receiptImages.length > 0) {
    const sent = await sendReceiptImage(
      request,
      request.receiptImages[0],
      1,
      buildRequestMessage(request),
      buildApprovalKeyboard(request.id)
    ).catch((error) => {
      console.error("[telegram] primary receipt notification failed", error);
      return null;
    });

    if (sent) {
      await sendExtraReceiptImages(request, 1).catch((error) => {
        console.error("[telegram] extra receipt images notification failed", error);
      });
      return;
    }
  }

  await telegramApi("sendMessage", {
    chat_id: env.telegramChatId,
    text: buildRequestMessage(request),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildApprovalKeyboard(request.id),
  });
}

export async function notifyCurrencyConversionCreated(conversionId: string) {
  if (!telegramEnabled()) {
    console.log("[telegram] skipped currency conversion notification: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }

  const conversion = await getCurrencyConversionForTelegram(conversionId);
  if (!conversion) return;

  const sentPhoto = await sendCurrencyConversionPhotoNotification(conversion).catch((error) => {
    console.error("[telegram] currency conversion photo notification failed", error);
    return null;
  });
  if (sentPhoto) return;

  await telegramApi("sendMessage", {
    chat_id: env.telegramChatId,
    text: buildCurrencyConversionMessage(conversion),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildCurrencyConversionKeyboard(conversion.id),
  });
}

export async function notifyCurrencyConversionStatusChanged(conversionId: string) {
  if (!telegramEnabled()) {
    console.log("[telegram] skipped currency conversion status notification: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }

  const conversion = await getCurrencyConversionForTelegram(conversionId);
  if (!conversion) return;

  await telegramApi("sendMessage", {
    chat_id: env.telegramChatId,
    text: buildCurrencyConversionMessage(conversion),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

async function answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false) {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

async function sendCallbackMessage(callback: TelegramCallbackQuery, text: string) {
  const chatId = callback.message?.chat?.id;
  if (!chatId) return;

  await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}

async function updateTelegramMessage(input: {
  chatId?: number | string;
  messageId?: number;
  requestId: string;
  statusLine: string;
  hasMedia?: boolean;
}) {
  const { chatId, messageId, requestId, statusLine, hasMedia } = input;
  if (!chatId || !messageId) return false;

  const request = await getRequestForTelegram(requestId);
  const text = request
    ? `${buildRequestMessage(request)}\n\n${statusLine}`
    : statusLine;
  if (hasMedia) {
    const captionResult = await telegramApi("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption: text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] },
    });
    if (captionResult) return true;
  }

  const editResult = await telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
  if (editResult) return true;

  await telegramApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
  return false;
}

async function updateCallbackMessage(callback: TelegramCallbackQuery, requestId: string, statusLine: string) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  const hasMedia = Boolean(callback.message?.caption || callback.message?.photo?.length);
  const updated = await updateTelegramMessage({ chatId, messageId, requestId, statusLine, hasMedia });
  if (!updated) {
    await sendCallbackMessage(callback, statusLine);
  }
}

async function updateCurrencyConversionCallbackMessage(callback: TelegramCallbackQuery, conversionId: string) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  if (!chatId || !messageId) return false;

  const conversion = await getCurrencyConversionForTelegram(conversionId);
  if (!conversion) return false;

  const hasMedia = Boolean(callback.message?.caption || callback.message?.photo?.length);
  if (hasMedia) {
    const captionResult = await telegramApi("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption: buildCurrencyConversionMessage(conversion, { compactForCaption: true }),
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [] },
    });
    if (captionResult) return true;
  }

  const editResult = await telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: buildCurrencyConversionMessage(conversion),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
  return Boolean(editResult);
}

function rejectPromptMarker(requestId: string, messageId: number, hasMedia: boolean) {
  return `reject:${requestId}:${messageId}:${hasMedia ? "photo" : "text"}`;
}

function parseRejectPromptMarker(message?: string) {
  const match = message?.match(/reject:([a-z0-9]+):(\d+):(photo|text)/i);
  if (!match) return null;
  return {
    requestId: match[1],
    messageId: Number(match[2]),
    hasMedia: match[3] === "photo",
  };
}

async function requestRejectReason(callback: TelegramCallbackQuery, requestId: string) {
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;
  if (!chatId || !messageId) {
    await sendCallbackMessage(callback, "Không xác định được tin nhắn cần từ chối.");
    return;
  }

  const hasMedia = Boolean(callback.message?.caption || callback.message?.photo?.length);
  const promptResult = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: [
      "<b>Nhập lý do từ chối</b>",
      TELEGRAM_SEPARATOR,
      "Hãy reply tin nhắn này với lý do để hoàn tất từ chối yêu cầu.",
      "",
      `<code>${rejectPromptMarker(requestId, messageId, hasMedia)}</code>`,
    ].join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
    allow_sending_without_reply: true,
  });

  if (!promptResult) {
    await sendCallbackMessage(callback, "Không gửi được tin nhắn nhập lý do. Vui lòng thử lại.");
  }
}

async function handleRejectReasonMessage(message: TelegramMessage) {
  const marker = parseRejectPromptMarker(message.reply_to_message?.text);
  if (!marker) {
    return { handled: false };
  }

  const reason = (message.text ?? "").trim();
  if (!reason) {
    await telegramApi("sendMessage", {
      chat_id: message.chat?.id,
      text: "Lý do từ chối không được để trống. Vui lòng reply lại bằng lý do cụ thể.",
      reply_to_message_id: message.message_id,
    });
    return { handled: true, ok: false };
  }

  const actor = await getTelegramApprovalActor();
  if (!actor) {
    await telegramApi("sendMessage", {
      chat_id: message.chat?.id,
      text: "Chưa cấu hình người duyệt Telegram.",
      reply_to_message_id: message.message_id,
    });
    return { handled: true, ok: false };
  }

  const note = reason.slice(0, REJECT_REASON_MAX_LENGTH);
  try {
    await rejectPurchaseRequest({
      id: marker.requestId,
      actor,
      note,
      auditAction: "purchase_request.telegram_reject",
    });
    await updateTelegramMessage({
      chatId: message.chat?.id,
      messageId: marker.messageId,
      requestId: marker.requestId,
      statusLine: `<b>Đã từ chối</b> bởi ${escapeHtml(actor.fullName)}\n<b>Lý do:</b> ${escapeHtml(note)}`,
      hasMedia: marker.hasMedia,
    });
    await telegramApi("sendMessage", {
      chat_id: message.chat?.id,
      text: "Đã ghi nhận lý do từ chối.",
      reply_to_message_id: message.message_id,
    });
    return { handled: true, ok: true };
  } catch (error) {
    const errorMessage = error instanceof PurchaseRequestActionError ? error.message : "Xử lý thất bại";
    const request = await getRequestForTelegram(marker.requestId);
    if (request && request.status !== "PENDING_APPROVAL") {
      await updateTelegramMessage({
        chatId: message.chat?.id,
        messageId: marker.messageId,
        requestId: marker.requestId,
        statusLine: `<b>Yêu cầu đã được xử lý trước đó</b> (${escapeHtml(request.status)})`,
        hasMedia: marker.hasMedia,
      });
    } else {
      await telegramApi("sendMessage", {
        chat_id: message.chat?.id,
        text: escapeHtml(errorMessage),
        parse_mode: "HTML",
        reply_to_message_id: message.message_id,
      });
    }
    return { handled: true, ok: false, error: errorMessage };
  }
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
  const textMessage = update.message ?? update.channel_post;
  if (textMessage) {
    return handleRejectReasonMessage(textMessage);
  }

  const callback = update.callback_query;
  if (!callback?.id || !callback.data) {
    return { handled: false };
  }

  const purchaseRequestMatch = callback.data.match(/^pr:(approve|reject):(.+)$/);
  const currencyConversionMatch = callback.data.match(/^cc:(succeeded|failed):(.+)$/);
  if (!purchaseRequestMatch && !currencyConversionMatch) {
    await answerCallbackQuery(callback.id, "Hành động không hợp lệ", true);
    return { handled: false };
  }

  const actor = await getTelegramApprovalActor();
  if (!actor) {
    await answerCallbackQuery(callback.id, "Chưa cấu hình người duyệt Telegram", true);
    return { handled: true, ok: false };
  }

  try {
    await answerCallbackQuery(callback.id, "Đang xử lý...");

    if (currencyConversionMatch) {
      const [, action, conversionId] = currencyConversionMatch;
      await updateCurrencyConversionStatus({
        id: conversionId,
        actor,
        status: action === "succeeded" ? "SUCCEEDED" : "FAILED",
        auditAction: `currency_conversion.telegram_${action}`,
      });
      const updated = await updateCurrencyConversionCallbackMessage(callback, conversionId);
      if (!updated) {
        await sendCallbackMessage(callback, action === "succeeded" ? "Đã cập nhật thành công" : "Đã cập nhật thất bại");
      }
      return { handled: true, ok: true };
    }

    if (!purchaseRequestMatch) {
      await sendCallbackMessage(callback, "Hành động không hợp lệ.");
      return { handled: false };
    }
    const [, action, requestId] = purchaseRequestMatch;
    if (action === "approve") {
      await approvePurchaseRequest({
        id: requestId,
        actor,
        note: "Đồng ý duyệt từ Telegram",
        auditAction: "purchase_request.telegram_approve",
      });
      await updateCallbackMessage(callback, requestId, `<b>Đã duyệt</b> bởi ${escapeHtml(actor.fullName)}`);
      return { handled: true, ok: true };
    }

    await requestRejectReason(callback, requestId);
    return { handled: true, ok: true, pendingReason: true };
  } catch (error) {
    const message =
      error instanceof PurchaseRequestActionError || error instanceof CurrencyConversionActionError
        ? error.message
        : "Xử lý thất bại";
    if (currencyConversionMatch) {
      const [, , conversionId] = currencyConversionMatch;
      const conversion = await getCurrencyConversionForTelegram(conversionId);
      if (conversion && conversion.status !== "PENDING") {
        await updateCurrencyConversionCallbackMessage(callback, conversionId);
      } else {
        await sendCallbackMessage(callback, `<b>${escapeHtml(message)}</b>`);
      }
      return { handled: true, ok: false, error: message };
    }

    if (!purchaseRequestMatch) {
      await sendCallbackMessage(callback, `<b>${escapeHtml(message)}</b>`);
      return { handled: false, ok: false, error: message };
    }
    const [, , requestId] = purchaseRequestMatch;
    const request = await getRequestForTelegram(requestId);
    if (request && request.status !== "PENDING_APPROVAL") {
      await updateCallbackMessage(
        callback,
        requestId,
        `<b>Yêu cầu đã được xử lý trước đó</b> (${escapeHtml(request.status)})`
      );
    } else {
      await sendCallbackMessage(callback, `<b>${escapeHtml(message)}</b>`);
    }
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
