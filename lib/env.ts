const requireEnv = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export const env = {
  databaseUrl: requireEnv("DATABASE_URL", "mysql://root:root@localhost:3306/bugmedia_finance"),
  redisUrl: requireEnv("REDIS_URL", "redis://localhost:6379"),
  jwtSecret: requireEnv("JWT_SECRET", "change-me-in-production"),
  defaultUsdToVnd: Number(process.env.DEFAULT_USD_TO_VND ?? "25000"),
  appUrl: process.env.URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3515",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  telegramApproverEmail: process.env.TELEGRAM_APPROVER_EMAIL,
};
