import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type TransactionNote = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

const createNoteSchema = z.object({
  content: z.string().trim().min(1, "Ghi chú không được để trống").max(2000, "Ghi chú quá dài"),
});

function parseNotes(value: unknown): TransactionNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        typeof row.content !== "string" ||
        typeof row.createdAt !== "string" ||
        typeof row.authorId !== "string" ||
        typeof row.authorName !== "string"
      ) {
        return null;
      }
      return {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        authorId: row.authorId,
        authorName: row.authorName,
      };
    })
    .filter((item): item is TransactionNote => item !== null);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("transaction.read");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }
  const canReadAllTransactions = auth.user.roles.includes("ADMIN") || auth.user.roles.includes("ACCOUNTANT");

  const { id } = await params;
  const row = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      teamUserId: true,
      notes: true,
    },
  });
  if (!row) {
    return fail("Giao dịch không tồn tại", 404);
  }
  if (!canReadAllTransactions && row.teamUserId !== auth.user.id) {
    return fail("Giao dịch không tồn tại", 404);
  }

  return ok({ rows: parseNotes(row.notes) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("transaction.update");
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Payload không hợp lệ", 400);
  }

  const current = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      notes: true,
    },
  });
  if (!current) {
    return fail("Giao dịch không tồn tại", 404);
  }

  const existing = parseNotes(current.notes);
  const newNote: TransactionNote = {
    id: randomUUID(),
    content: parsed.data.content,
    createdAt: new Date().toISOString(),
    authorId: auth.user.id,
    authorName: auth.user.fullName,
  };
  const nextNotes = [...existing, newNote];

  await prisma.transaction.update({
    where: { id },
    data: {
      notes: nextNotes,
    },
  });

  await writeAuditLog({
    actor: auth.user,
    action: "transaction.note.add",
    entityType: "transaction",
    entityId: id,
    beforeData: { notesCount: existing.length },
    afterData: { notesCount: nextNotes.length, note: newNote },
  });

  return ok({ rows: nextNotes, row: newNote }, 201);
}
