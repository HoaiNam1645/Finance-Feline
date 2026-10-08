import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(2).max(191),
  type: z.string().trim().min(1).max(50).optional().default("OTHER"),
  contactName: z.string().trim().max(191).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  contactEmail: z.string().trim().max(191).optional(),
  note: z.string().trim().max(2000).optional(),
});

function cleanOptional(value: string | undefined) {
  return value?.trim() || null;
}

export async function GET() {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const rows = await prisma.externalParty.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return ok({ rows });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("request.pay");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail("Thông tin bên nợ không hợp lệ", 400);
  }

  const row = await prisma.externalParty.create({
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
    action: "external_party.create",
    entityType: "ExternalParty",
    entityId: row.id,
    afterData: row,
  });

  return ok({ row }, 201);
}
