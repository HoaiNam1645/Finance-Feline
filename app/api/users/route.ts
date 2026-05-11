import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  roles: z.array(z.string().min(1)).min(1),
});

export async function GET() {
  const auth = await requireApiUser("user.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: {
        roles: {
          include: { role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.role.findMany({ orderBy: { code: "asc" } }),
  ]);

  const userIds = users.map((user: (typeof users)[number]) => user.id);
  const activityCounts = userIds.length
    ? await prisma.auditLog.groupBy({
        by: ["actorId"],
        where: {
          actorId: { in: userIds },
        },
        _count: {
          _all: true,
        },
      })
    : [];
  const activityCountByUserId = new Map<string, number>(
    activityCounts
      .filter((row: (typeof activityCounts)[number]) => typeof row.actorId === "string")
      .map((row: (typeof activityCounts)[number]) => [row.actorId as string, Number(row._count._all ?? 0)])
  );

  return ok({
    rows: users.map((user: (typeof users)[number]) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      createdAt: user.createdAt,
      roles: user.roles.map((entry: (typeof user.roles)[number]) => entry.role.code),
      hasActivity: (activityCountByUserId.get(user.id) ?? 0) > 0,
    })),
    roleOptions: roles.map((role: (typeof roles)[number]) => ({
      id: role.id,
      code: role.code,
      name: role.name,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("user.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const roleRows = await prisma.role.findMany({
    where: { code: { in: parsed.data.roles } },
    select: { id: true, code: true },
  });
  if (roleRows.length !== parsed.data.roles.length) {
    return fail("Vai trò không hợp lệ", 400);
  }

  const existed = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existed) {
    return fail("Email đã tồn tại", 409);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const row = await prisma.user.create({
    data: {
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      passwordHash,
      status: "ACTIVE",
      roles: {
        createMany: {
          data: roleRows.map((role: (typeof roleRows)[number]) => ({
            roleId: role.id,
          })),
        },
      },
    },
    include: {
      roles: { include: { role: true } },
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "user.create",
    entityType: "user",
    entityId: row.id,
    afterData: {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      status: row.status,
      roles: row.roles.map((entry: (typeof row.roles)[number]) => entry.role.code),
    },
  });

  return ok(
    {
      row: {
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        status: row.status,
        createdAt: row.createdAt,
        roles: row.roles.map((entry: (typeof row.roles)[number]) => entry.role.code),
      },
    },
    201
  );
}
