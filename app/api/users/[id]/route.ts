import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const patchSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  roles: z.array(z.string().min(1)).min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("user.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const before = await prisma.user.findUnique({
    where: { id },
    include: { roles: { include: { role: true } } },
  });
  if (!before) {
    return fail("User không tồn tại", 404);
  }

  const emailOwner = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (emailOwner && emailOwner.id !== id) {
    return fail("Email đã được dùng bởi tài khoản khác", 409);
  }

  const roleRows = await prisma.role.findMany({
    where: { code: { in: parsed.data.roles } },
    select: { id: true, code: true },
  });
  if (roleRows.length !== parsed.data.roles.length) {
    return fail("Vai trò không hợp lệ", 400);
  }

  const nextHasAdminRole = roleRows.some((role: (typeof roleRows)[number]) => role.code === "ADMIN");
  const beforeHasAdminRole = before.roles.some((entry: (typeof before.roles)[number]) => entry.role.code === "ADMIN");
  const nextStatus = parsed.data.status;

  if (auth.user.id === id && (!nextHasAdminRole || nextStatus !== "ACTIVE")) {
    return fail("Không thể tự bỏ quyền ADMIN hoặc tự khóa tài khoản của chính mình", 400);
  }

  if (beforeHasAdminRole && (!nextHasAdminRole || nextStatus !== "ACTIVE")) {
    const otherActiveAdminCount = await prisma.user.count({
      where: {
        id: { not: id },
        status: "ACTIVE",
        roles: {
          some: {
            role: { code: "ADMIN" },
          },
        },
      },
    });
    if (otherActiveAdminCount === 0) {
      return fail("Hệ thống phải luôn có ít nhất 1 ADMIN đang hoạt động", 400);
    }
  }

  const updated = await prisma.$transaction(async (tx: TxClient) => {
    const row = await tx.user.update({
      where: { id },
      data: {
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        status: nextStatus,
        ...(parsed.data.password ? { passwordHash: await bcrypt.hash(parsed.data.password, 10) } : {}),
      },
    });

    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.userRole.createMany({
      data: roleRows.map((role: (typeof roleRows)[number]) => ({
        userId: id,
        roleId: role.id,
      })),
    });

    const roles = await tx.userRole.findMany({
      where: { userId: id },
      include: { role: true },
    });

    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      status: row.status,
      createdAt: row.createdAt,
      roles: roles.map((entry: (typeof roles)[number]) => entry.role.code),
    };
  });

  const action =
    before.status !== parsed.data.status
      ? parsed.data.status === "INACTIVE"
        ? "user.ban"
        : "user.unban"
      : "user.update";

  await writeAuditLog({
    actor: auth.user,
    action,
    entityType: "user",
    entityId: id,
    beforeData: {
      id: before.id,
      email: before.email,
      fullName: before.fullName,
      status: before.status,
      roles: before.roles.map((entry: (typeof before.roles)[number]) => entry.role.code),
    },
    afterData: updated,
  });

  return ok({ row: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("user.manage");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  if (auth.user.id === id) {
    return fail("Không thể tự xóa tài khoản của chính mình", 400);
  }

  const before = await prisma.user.findUnique({
    where: { id },
    include: { roles: { include: { role: true } } },
  });
  if (!before) {
    return fail("User không tồn tại", 404);
  }

  const hasActivity = await prisma.auditLog.count({
    where: {
      actorId: id,
    },
  });
  if (hasActivity > 0) {
    return fail("User đã có hoạt động nên không thể xóa", 409);
  }

  const beforeHasActiveAdminRole =
    before.status === "ACTIVE" &&
    before.roles.some((entry: (typeof before.roles)[number]) => entry.role.code === "ADMIN");
  if (beforeHasActiveAdminRole) {
    const otherActiveAdminCount = await prisma.user.count({
      where: {
        id: { not: id },
        status: "ACTIVE",
        roles: {
          some: {
            role: { code: "ADMIN" },
          },
        },
      },
    });
    if (otherActiveAdminCount === 0) {
      return fail("Hệ thống phải luôn có ít nhất 1 ADMIN đang hoạt động", 400);
    }
  }

  try {
    await prisma.$transaction(async (tx: TxClient) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  } catch {
    return fail("User đã có dữ liệu liên quan nên không thể xóa", 409);
  }

  await writeAuditLog({
    actor: auth.user,
    action: "user.delete",
    entityType: "user",
    entityId: id,
    beforeData: {
      id: before.id,
      email: before.email,
      fullName: before.fullName,
      status: before.status,
      roles: before.roles.map((entry: (typeof before.roles)[number]) => entry.role.code),
    },
  });

  return ok({ deleted: true, id });
}
