/** Roles whose members are treated as staff: they raise requests and get counted per person. */
export const STAFF_ROLE_CODES = ["EMPLOYEE", "WORKSHOP", "ACCOUNT"] as const;
export const SCOPED_REPORT_ROLE_CODES = ["DIEU_AM"] as const;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Quản trị",
  ACCOUNTANT: "Kế toán",
  EMPLOYEE: "Nhân viên Feline",
  WORKSHOP: "Nhân viên xưởng",
  ACCOUNT: "Account",
  DIEU_AM: "Dieu Am",
};

export function roleLabel(code: string) {
  return ROLE_LABELS[code] ?? code;
}

export function isStaffRole(code: string) {
  return (STAFF_ROLE_CODES as readonly string[]).includes(code);
}

/** True for someone who only holds staff roles, i.e. no admin or accountant powers. */
export function isStaffOnly(roles: string[]) {
  return roles.some(isStaffRole) && !roles.includes("ADMIN") && !roles.includes("ACCOUNTANT");
}
