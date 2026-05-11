import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  PrismaClient,
  PurchaseRequestStatus,
  TransactionDirection,
  TransactionType,
  UserStatus,
} from "@prisma/client";

const databaseUrl =
  process.env.DATABASE_URL ??
  "mysql://root:root@localhost:3306/bugmedia_finance";
const adapter = new PrismaMariaDb(databaseUrl);

const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("12345678", 10);

  await prisma.currency.upsert({
    where: { code: "VND" },
    update: {},
    create: { code: "VND", name: "Vietnam Dong", precision: 0 },
  });

  await prisma.currency.upsert({
    where: { code: "USD" },
    update: {},
    create: { code: "USD", name: "US Dollar", precision: 2 },
  });

  await prisma.exchangeRate.create({
    data: {
      fromCurrency: "USD",
      toCurrency: "VND",
      rate: 25000,
      source: "DEFAULT",
      effectiveFrom: new Date(),
    },
  });

  const permissions = [
    ["request.create", "Create purchase requests"],
    ["request.submit", "Submit purchase requests"],
    ["request.read.own", "Read own purchase requests"],
    ["request.read.all", "Read all purchase requests"],
    ["request.approve", "Approve purchase requests"],
    ["request.reject", "Reject purchase requests"],
    ["request.pay", "Pay approved requests"],
    ["transaction.create", "Create transactions"],
    ["transaction.read", "Read transactions"],
    ["transaction.update", "Update transactions"],
    ["transaction.adjust.request", "Request transaction adjustments"],
    ["transaction.adjust.approve", "Approve transaction adjustments"],
    ["category.manage", "Manage categories"],
    ["audit.read", "Read audit logs"],
    ["user.manage", "Manage users"],
  ] as const;

  const permissionIds: Record<string, string> = {};

  for (const [code, name] of permissions) {
    const created = await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    permissionIds[code] = created.id;
  }

  const roles = {
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
      "request.read.all",
      "request.approve",
      "request.pay",
      "transaction.create",
      "transaction.read",
      "transaction.update",
      "transaction.adjust.request",
      "category.manage",
    ],
    EMPLOYEE: ["request.create", "request.submit", "request.read.own"],
  } as const;

  for (const [code, codes] of Object.entries(roles)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: code },
      create: { code, name: code },
    });

    for (const permissionCode of codes) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permissionIds[permissionCode],
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permissionIds[permissionCode],
        },
      });
    }
  }

  const users = [
    { email: "admin@company.local", fullName: "Admin Đức", role: "ADMIN" },
    {
      email: "accountant@company.local",
      fullName: "Trương Mai",
      role: "ACCOUNTANT",
    },
    { email: "employee@company.local", fullName: "Employee One", role: "EMPLOYEE" },
  ] as const;

  for (const userData of users) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: userData.role } });
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        fullName: userData.fullName,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: userData.email,
        fullName: userData.fullName,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  const categories = [
    { code: "SALARY", name: "Chi phí lương", type: TransactionType.EXPENSE },
    { code: "ORDER_COST", name: "Chi phí đơn hàng", type: TransactionType.EXPENSE },
    { code: "OFFICE_COST", name: "Chi phí văn phòng", type: TransactionType.EXPENSE },
    { code: "MARKETING_COST", name: "Chi phí marketing", type: TransactionType.EXPENSE },
    { code: "RENT_COST", name: "Chi phí mặt bằng", type: TransactionType.EXPENSE },
    { code: "SERVICE_INCOME", name: "Doanh thu dịch vụ", type: TransactionType.INCOME },
    { code: "PROJECT_INCOME", name: "Doanh thu dự án", type: TransactionType.INCOME },
    { code: "OTHER_INCOME", name: "Thu nhập khác", type: TransactionType.INCOME },
  ];

  for (const category of categories) {
    await prisma.transactionCategory.upsert({
      where: { code: category.code },
      update: category,
      create: category,
    });
  }


  const employee = await prisma.user.findUniqueOrThrow({ where: { email: "employee@company.local" } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@company.local" } });
  const accountant = await prisma.user.findUniqueOrThrow({ where: { email: "accountant@company.local" } });
  const orderCostCategory = await prisma.transactionCategory.findUniqueOrThrow({
    where: { code: "ORDER_COST" },
  });

  await prisma.purchaseRequest.create({
    data: {
      requesterId: employee.id,
      categoryId: orderCostCategory.id,
      title: "Mua vật tư văn phòng tháng này",
      description: "Mực in + giấy A4",
      expectedAmount: 120,
      currencyCode: "USD",
      status: PurchaseRequestStatus.PENDING_APPROVAL,
      items: {
        create: [
          {
            itemName: "Giấy A4",
            qty: 10,
            unitPrice: 5,
            currencyCode: "USD",
            subtotal: 50,
          },
          {
            itemName: "Mực in",
            qty: 2,
            unitPrice: 35,
            currencyCode: "USD",
            subtotal: 70,
          },
        ],
      },
    },
  });

  // Clean previous generated seed transactions to keep data stable across reruns.
  await prisma.transaction.deleteMany({
    where: {
      description: { startsWith: "[SEED]" },
    },
  });

  const incomeCategories = await prisma.transactionCategory.findMany({
    where: {
      code: { in: ["SERVICE_INCOME", "PROJECT_INCOME", "OTHER_INCOME"] },
      type: TransactionType.INCOME,
      isActive: true,
    },
    orderBy: { code: "asc" },
  });
  const expenseCategories = await prisma.transactionCategory.findMany({
    where: {
      code: { in: ["SALARY", "ORDER_COST", "OFFICE_COST", "MARKETING_COST", "RENT_COST"] },
      type: TransactionType.EXPENSE,
      isActive: true,
    },
    orderBy: { code: "asc" },
  });

  const seedTransactions: Array<{
    direction: TransactionDirection;
    teamUserId?: string | null;
    categoryId: string;
    amountOriginal: number;
    currencyCode: "VND" | "USD";
    exchangeRateToVnd: number;
    amountVnd: number;
    description: string;
    transactionDate: Date;
    paymentMethod: string;
    createdBy: string;
    approvedBy: string;
  }> = [];

  const now = new Date();
  const baseExchange = 25_000;

  for (let monthOffset = 0; monthOffset < 12; monthOffset += 1) {
    const baseMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);

    for (let i = 0; i < 10; i += 1) {
      const incomeCategory = incomeCategories[i % incomeCategories.length];
      const incomeDate = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 2 + (i * 2) % 26, 9, 15);
      const incomeIsUsd = i % 3 === 0;
      const incomeOriginal = incomeIsUsd ? 200 + monthOffset * 5 + i * 17 : 15_000_000 + monthOffset * 600_000 + i * 350_000;
      const incomeVnd = incomeIsUsd ? incomeOriginal * baseExchange : incomeOriginal;

      seedTransactions.push({
        direction: TransactionDirection.IN,
        teamUserId: i % 5 === 0 ? null : employee.id,
        categoryId: incomeCategory.id,
        amountOriginal: incomeOriginal,
        currencyCode: incomeIsUsd ? "USD" : "VND",
        exchangeRateToVnd: incomeIsUsd ? baseExchange : 1,
        amountVnd: incomeVnd,
        description: `[SEED] Thu ${incomeCategory.name} M-${monthOffset} #${i + 1}`,
        transactionDate: incomeDate,
        paymentMethod: "BANK_TRANSFER",
        createdBy: accountant.id,
        approvedBy: admin.id,
      });

      const expenseCategory = expenseCategories[i % expenseCategories.length];
      const expenseDate = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 3 + (i * 2) % 25, 14, 5);
      const expenseIsUsd = i % 4 === 0;
      const expenseOriginal = expenseIsUsd ? 80 + monthOffset * 2 + i * 9 : 8_000_000 + monthOffset * 400_000 + i * 250_000;
      const expenseVnd = expenseIsUsd ? expenseOriginal * baseExchange : expenseOriginal;

      seedTransactions.push({
        direction: TransactionDirection.OUT,
        teamUserId: i % 4 === 0 ? null : employee.id,
        categoryId: expenseCategory.id,
        amountOriginal: expenseOriginal,
        currencyCode: expenseIsUsd ? "USD" : "VND",
        exchangeRateToVnd: expenseIsUsd ? baseExchange : 1,
        amountVnd: expenseVnd,
        description: `[SEED] Chi ${expenseCategory.name} M-${monthOffset} #${i + 1}`,
        transactionDate: expenseDate,
        paymentMethod: "BANK_TRANSFER",
        createdBy: accountant.id,
        approvedBy: admin.id,
      });
    }
  }

  for (const tx of seedTransactions) {
    await prisma.transaction.create({
      data: {
        direction: tx.direction,
        ...(typeof tx.teamUserId !== "undefined" ? { teamUserId: tx.teamUserId } : {}),
        categoryId: tx.categoryId,
        amountOriginal: tx.amountOriginal,
        currencyCode: tx.currencyCode,
        exchangeRateToVnd: tx.exchangeRateToVnd,
        amountVnd: tx.amountVnd,
        description: tx.description,
        transactionDate: tx.transactionDate,
        paymentMethod: tx.paymentMethod,
        createdBy: tx.createdBy,
        approvedBy: tx.approvedBy,
      },
    });
  }

  console.log(`Seed completed with ${seedTransactions.length} demo transactions. Login password for sample users: 12345678`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
