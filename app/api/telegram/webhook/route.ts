import { env } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { handleTelegramUpdate } from "@/lib/telegram";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (!env.telegramWebhookSecret) {
    return fail("Telegram webhook secret is not configured", 503);
  }

  const valid = querySecret === env.telegramWebhookSecret || headerSecret === env.telegramWebhookSecret;
  if (!valid) {
    return fail("Invalid Telegram webhook secret", 401);
  }

  const update = await request.json().catch(() => null);
  if (!update || typeof update !== "object") {
    return fail("Invalid Telegram update", 400);
  }

  const result = await handleTelegramUpdate(update);
  return ok(result);
}
