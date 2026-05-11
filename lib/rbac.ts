const rolePermissions: Record<string, string[]> = {
  ADMIN: [
    "request.read.all",
    "request.approve",
    "request.reject",
    "request.pay",
    "audit.read",
    "user.manage",
    "category.manage",
    "transaction.create",
    "transaction.read",
    "transaction.update",
    "transaction.adjust.request",
    "transaction.adjust.approve",
  ],
  ACCOUNTANT: [
    "request.create",
    "request.submit",
    "request.read.all",
    "request.approve",
    "request.pay",
    "transaction.create",
    "transaction.read",
    "transaction.update",
    "transaction.adjust.request",
    "category.manage",
  ],
  EMPLOYEE: ["request.create", "request.submit", "request.read.own", "transaction.read"],
};

export function hasPermission(roles: string[], permission: string) {
  return roles.some((role) => rolePermissions[role]?.includes(permission));
}

export function requirePermission(roles: string[], permission: string) {
  if (!hasPermission(roles, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}
