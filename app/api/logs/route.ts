import { requireApiUser } from "@/lib/api-auth";
import { forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(Math.floor(pageSizeRaw), 100) : 20;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const entityType = (url.searchParams.get("entityType") ?? "").trim();
  const entityId = (url.searchParams.get("entityId") ?? "").trim();
  const order = (url.searchParams.get("order") ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const canReadAllLogs = hasPermission(auth.user.roles, "audit.read");

  if (!canReadAllLogs) {
    if (!entityId) {
      return forbidden();
    }

    if (entityType === "purchase_request") {
      const purchaseRequest = await prisma.purchaseRequest.findUnique({
        where: { id: entityId },
        select: { requesterId: true },
      });

      if (!purchaseRequest || purchaseRequest.requesterId !== auth.user.id) {
        return forbidden();
      }
    } else if (entityType === "transaction") {
      const canReadAllTransactions =
        auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");

      if (!canReadAllTransactions) {
        const transaction = await prisma.transaction.findUnique({
          where: { id: entityId },
          select: { teamUsers: { select: { userId: true } } },
        });

        if (!transaction || !transaction.teamUsers.some((link) => link.userId === auth.user.id)) {
          return forbidden();
        }
      }
    } else {
      return forbidden();
    }
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) {
    fromDate.setHours(0, 0, 0, 0);
  }
  if (toDate && !Number.isNaN(toDate.getTime())) {
    toDate.setHours(23, 59, 59, 999);
  }

  const where = {
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    createdAt:
      (fromDate && !Number.isNaN(fromDate.getTime())) || (toDate && !Number.isNaN(toDate.getTime()))
        ? {
            ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
            ...(toDate && !Number.isNaN(toDate.getTime()) ? { lte: toDate } : {}),
          }
        : undefined,
    OR: q
      ? [
          { action: { contains: q } },
          { entityType: { contains: q } },
          { entityId: { contains: q } },
          { actorRoleSnapshot: { contains: q } },
          { actor: { fullName: { contains: q } } },
        ]
      : undefined,
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
