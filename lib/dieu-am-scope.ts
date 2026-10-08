export const DIEU_AM_ROLE_CODE = "DIEU_AM";
export const DIEU_AM_CATEGORY_BRANCH_CODE = "Y_KIEN_NGUYEN";

export function isDieuAmRole(roles: string[]) {
  return roles.includes(DIEU_AM_ROLE_CODE);
}

export function categoryBranchWhere(branchCode: string) {
  return {
    OR: [
      { category: { code: branchCode } },
      { category: { parent: { code: branchCode } } },
      { category: { parent: { parent: { code: branchCode } } } },
    ],
  };
}
