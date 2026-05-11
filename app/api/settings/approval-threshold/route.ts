import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit";
import { fail, forbidden, ok, unauthorized } from "@/lib/http";
import {
  DEFAULT_ACCOUNTANT_APPROVAL_THRESHOLD_VND,
  getAccountantApprovalThresholdVnd,
  setAccountantApprovalThresholdVnd,
} from "@/lib/settings";

const patchSchema = z.object({
  accountantApprovalThresholdVnd: z.number().int().positive(),
});

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  const accountantApprovalThresholdVnd = await getAccountantApprovalThresholdVnd();
  return ok({
    accountantApprovalThresholdVnd,
    defaultAccountantApprovalThresholdVnd: DEFAULT_ACCOUNTANT_APPROVAL_THRESHOLD_VND,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) {
    return auth.error === "UNAUTHORIZED" ? unauthorized() : forbidden();
  }

  if (!auth.user.roles.includes("ADMIN")) {
    return forbidden();
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Payload không hợp lệ", 400);
  }

  const before = await getAccountantApprovalThresholdVnd();
  await setAccountantApprovalThresholdVnd(parsed.data.accountantApprovalThresholdVnd);

  await writeAuditLog({
    actor: auth.user,
    action: "settings.accountant_approval_threshold.update",
    entityType: "app_setting",
    entityId: "ACCOUNTANT_APPROVAL_THRESHOLD_VND",
    beforeData: { accountantApprovalThresholdVnd: before },
    afterData: { accountantApprovalThresholdVnd: parsed.data.accountantApprovalThresholdVnd },
  });

  return ok({
    accountantApprovalThresholdVnd: parsed.data.accountantApprovalThresholdVnd,
  });
}
