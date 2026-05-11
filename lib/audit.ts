import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

function isPrismaForeignKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2003"
  );
}

export async function writeAuditLog(input: {
  actor: SessionUser | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  const headerStore = await headers();
  const requestId = headerStore.get("x-request-id") ?? crypto.randomUUID();
  const baseData = {
    actorRoleSnapshot: input.actor?.roles.join(",") ?? "SYSTEM",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeData: input.beforeData as never,
    afterData: input.afterData as never,
    ipAddress: headerStore.get("x-forwarded-for") ?? null,
    userAgent: headerStore.get("user-agent") ?? null,
    requestId,
  };

  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actor?.id,
        ...baseData,
      },
    });
  } catch (error) {
    // If actorId no longer exists (e.g., stale cookie after DB restore), retry without actorId.
    if (isPrismaForeignKeyError(error)) {
      await prisma.auditLog
        .create({
          data: {
            actorId: null,
            ...baseData,
          },
        })
        .catch(() => {
          // Do not break main request flow due to logging issues.
        });
      return;
    }
    // Do not break main request flow due to logging issues.
    console.error("[audit] writeAuditLog failed", error);
  }
}
