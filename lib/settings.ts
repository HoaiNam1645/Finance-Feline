import { prisma } from "@/lib/prisma";

const ACCOUNTANT_APPROVAL_THRESHOLD_KEY = "ACCOUNTANT_APPROVAL_THRESHOLD_VND";
export const DEFAULT_ACCOUNTANT_APPROVAL_THRESHOLD_VND = 5_000_000;

type AppSettingDelegate = {
  findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null>;
  upsert: (args: {
    where: { key: string };
    update: { value: string };
    create: { key: string; value: string };
  }) => Promise<unknown>;
};

function getAppSettingDelegate(): AppSettingDelegate | undefined {
  return (prisma as unknown as { appSetting?: {
    findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null>;
    upsert: (args: {
      where: { key: string };
      update: { value: string };
      create: { key: string; value: string };
    }) => Promise<unknown>;
  } }).appSetting;
}

async function ensureAppSettingsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "app_settings" (
      "key" TEXT PRIMARY KEY,
      "value" TEXT NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getAccountantApprovalThresholdVnd() {
  const appSetting = getAppSettingDelegate();
  let valueRaw: string | null = null;

  if (appSetting) {
    const row = await appSetting.findUnique({ where: { key: ACCOUNTANT_APPROVAL_THRESHOLD_KEY } }).catch(() => null);
    valueRaw = row?.value ?? null;
  } else {
    const rows = await prisma
      .$queryRaw<Array<{ value: string }>>`
        SELECT "value"
        FROM "app_settings"
        WHERE "key" = ${ACCOUNTANT_APPROVAL_THRESHOLD_KEY}
        LIMIT 1
      `
      .catch(() => []);
    valueRaw = rows[0]?.value ?? null;
  }

  if (!valueRaw) {
    return DEFAULT_ACCOUNTANT_APPROVAL_THRESHOLD_VND;
  }

  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_ACCOUNTANT_APPROVAL_THRESHOLD_VND;
  }
  return Math.floor(value);
}

export async function setAccountantApprovalThresholdVnd(value: number) {
  const normalized = Math.floor(value);

  const appSetting = getAppSettingDelegate();
  if (appSetting) {
    return appSetting.upsert({
      where: { key: ACCOUNTANT_APPROVAL_THRESHOLD_KEY },
      update: { value: String(normalized) },
      create: {
        key: ACCOUNTANT_APPROVAL_THRESHOLD_KEY,
        value: String(normalized),
      },
    });
  }

  await ensureAppSettingsTable();
  await prisma.$executeRaw`
    INSERT INTO "app_settings" ("key", "value")
    VALUES (${ACCOUNTANT_APPROVAL_THRESHOLD_KEY}, ${String(normalized)})
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updated_at" = NOW()
  `;

  return {
    where: { key: ACCOUNTANT_APPROVAL_THRESHOLD_KEY },
    value: String(normalized),
  };
}
