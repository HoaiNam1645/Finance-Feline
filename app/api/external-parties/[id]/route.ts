import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(191),
  type: z.string().trim().min(1).max(50),
  contactName: z.string().trim().max(191).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  contactEmail: z.string().trim().max(191).optional(),
  note: z.string().trim().max(2000).optional(),
});

function cleanOptional(value: string | undefined) {
  return value?.trim() || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Thông tin bên nợ không hợp lệ", 400);
  }

  const before = await prisma.externalParty.findUnique({ where: { id } });
  if (!before || !before.isActive) {
    return fail("Không tìm thấy bên nợ", 404);
  }

  const row = await prisma.externalParty.update({
    where: { id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      contactName: cleanOptional(parsed.data.contactName),
      contactPhone: cleanOptional(parsed.data.contactPhone),
      contactEmail: cleanOptional(parsed.data.contactEmail),
      note: cleanOptional(parsed.data.note),
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "external_party.update",
    entityType: "ExternalParty",
    entityId: row.id,
    beforeData: before,
    afterData: row,
  });

  return ok({ row });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const before = await prisma.externalParty.findUnique({ where: { id } });
  if (!before || !before.isActive) {
    return fail("Không tìm thấy bên nợ", 404);
  }

  const row = await prisma.externalParty.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "external_party.delete",
    entityType: "ExternalParty",
    entityId: row.id,
    beforeData: before,
    afterData: row,
  });

  return ok({ row });
}
