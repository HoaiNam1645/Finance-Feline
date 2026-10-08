import { DashboardOverview } from "@/components/app/dashboard-overview";
import { prisma } from "@/lib/prisma";
import { STAFF_ROLE_CODES } from "@/lib/roles";

type AdminDashboardProps = {
  /** Populate the employee filter with members holding this role. */
  staffRoleCode?: (typeof STAFF_ROLE_CODES)[number] | string;
  /** Limit report data to one structured category tree. */
  categoryRootCode?: string;
  /** Omit internal branches that should not contribute to financial reporting. */
  excludedCategoryBranchCodes?: string[];
  title?: string;
  description?: string;
  variant?: "full" | "compact" | "category-only";
};

const DEFAULT_EXCLUDED_CATEGORY_BRANCH_CODES = ["Y_KIEN_NGUYEN"];

export async function AdminDashboard({
  staffRoleCode,
  categoryRootCode,
  excludedCategoryBranchCodes = DEFAULT_EXCLUDED_CATEGORY_BRANCH_CODES,
  title,
  description,
  variant,
}: AdminDashboardProps) {
  const now = new Date();
  const startOfPreviousYear = new Date(now.getFullYear() - 1, 0, 1);
  const staffRoleFilter = staffRoleCode ? [staffRoleCode] : [...STAFF_ROLE_CODES];

  const [transactions, teamUsers] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        transactionDate: { gte: startOfPreviousYear },
        ...(categoryRootCode
          ? {
              OR: [
                { category: { code: categoryRootCode } },
                { category: { parent: { code: categoryRootCode } } },
                { category: { parent: { parent: { code: categoryRootCode } } } },
              ],
            }
          : {}),
        ...(excludedCategoryBranchCodes.length
          ? {
              NOT: {
                OR: [
                  { category: { code: { in: excludedCategoryBranchCodes } } },
                  { category: { parent: { code: { in: excludedCategoryBranchCodes } } } },
                  { category: { parent: { parent: { code: { in: excludedCategoryBranchCodes } } } } },
                ],
              },
            }
          : {}),
      },
      orderBy: { transactionDate: "asc" },
      select: {
        id: true,
        direction: true,
        amountVnd: true,
        transactionDate: true,
        description: true,
        category: {
          select: { name: true, parent: { select: { name: true, parent: { select: { name: true } } } } },
        },
        teamUsers: { select: { user: { select: { id: true, fullName: true } } } },
        paymentAccount: { select: { id: true, accountName: true, bankName: true, accountNumber: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { code: { in: staffRoleFilter } } } },
        AND: [
          { roles: { none: { role: { code: "ADMIN" } } } },
          { roles: { none: { role: { code: "ACCOUNTANT" } } } },
        ],
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <DashboardOverview
      title={title}
      description={description}
      variant={variant}
      teamUsers={teamUsers.map((item: (typeof teamUsers)[number]) => ({
        id: item.id,
        name: item.fullName,
      }))}
      transactions={transactions.map((transaction: (typeof transactions)[number]) => ({
        id: transaction.id,
        direction: transaction.direction,
        amountVnd: Number(transaction.amountVnd),
        transactionDate: transaction.transactionDate.toISOString(),
        categoryName: transaction.category.name,
        categoryParentName: transaction.category.parent?.name ?? null,
        categoryPath: [
          transaction.category.parent?.parent?.name,
          transaction.category.parent?.name,
          transaction.category.name,
        ].filter((name): name is string => Boolean(name)),
        categoryRootName:
          transaction.category.parent?.parent?.name ?? transaction.category.parent?.name ?? transaction.category.name,
        categorySubPath:
          [
            transaction.category.parent?.parent ? transaction.category.parent?.name : null,
            transaction.category.parent ? transaction.category.name : null,
          ]
            .filter(Boolean)
            .join(" / ") || null,
        teamUsers: transaction.teamUsers.map((link: (typeof transaction.teamUsers)[number]) => ({
          id: link.user.id,
          name: link.user.fullName,
        })),
        description: transaction.description,
        paymentAccount: transaction.paymentAccount
          ? {
              id: transaction.paymentAccount.id,
              accountName: transaction.paymentAccount.accountName,
              bankName: transaction.paymentAccount.bankName,
              accountNumber: transaction.paymentAccount.accountNumber,
            }
          : null,
      }))}
    />
  );
}
