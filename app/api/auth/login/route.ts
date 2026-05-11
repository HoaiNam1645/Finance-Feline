import { z } from "zod";
import { createSessionToken, loginWithPassword, setSessionCookie } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    await writeAuditLog({
      actor: null,
      action: "auth.login.invalid_payload",
      entityType: "auth_session",
      entityId: "unknown",
      afterData: {
        email: typeof body?.email === "string" ? body.email : null,
      },
    });
    return fail("Invalid login payload", 400);
  }

  const user = await loginWithPassword(parsed.data.email, parsed.data.password);
  if (!user) {
    await writeAuditLog({
      actor: null,
      action: "auth.login.failed",
      entityType: "auth_session",
      entityId: parsed.data.email,
      afterData: {
        email: parsed.data.email,
      },
    });
    return fail("Email hoặc mật khẩu không đúng", 401);
  }

  const token = await createSessionToken(user);
  await setSessionCookie(token);

  await writeAuditLog({
    actor: user,
    action: "auth.login.success",
    entityType: "auth_session",
    entityId: user.id,
    afterData: {
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles,
    },
  });

  return ok({ user });
}
