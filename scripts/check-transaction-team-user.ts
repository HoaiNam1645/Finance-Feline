import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../lib/env";

const adapter = new PrismaMariaDb(env.databaseUrl);
const prisma = new PrismaClient({ adapter, log: ["error"] });

type CandidateRow = {
  id: string;
  teamUsers: { userId: string }[];
  purchaseRequestId: string | null;
  createdAt: Date;
  transactionDate: Date;
  purchaseRequest: {
    id: string;
    requesterId: string;
    title: string;
  } | null;
};

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const shouldFix = hasFlag("--fix");

  const rows = (await prisma.transaction.findMany({
    where: {
      purchaseRequestId: {
        not: null,
      },
    },
    select: {
      id: true,
      teamUsers: { select: { userId: true } },
      purchaseRequestId: true,
      createdAt: true,
      transactionDate: true,
      purchaseRequest: {
        select: {
          id: true,
          requesterId: true,
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  })) as CandidateRow[];

  // Hợp lệ khi requester của purchase request nằm trong danh sách team user của giao dịch.
  const invalidRows = rows.filter((row) => {
    if (!row.purchaseRequest) return false;
    return !row.teamUsers.some((link) => link.userId === row.purchaseRequest!.requesterId);
  });

  const missingRows = invalidRows.filter((row) => row.teamUsers.length === 0);
  const mismatchedRows = invalidRows.filter((row) => row.teamUsers.length > 0);

  console.log(`Tong giao dich co purchase request: ${rows.length}`);
  console.log(`Giao dich thieu requester trong team user: ${invalidRows.length}`);
  console.log(`- Chua co team user nao: ${missingRows.length}`);
  console.log(`- Co team user nhung thieu requester: ${mismatchedRows.length}`);

  if (invalidRows.length > 0) {
    console.log("\nDanh sach giao dich sai (toi da 100 dong):");
    for (const row of invalidRows.slice(0, 100)) {
      const expected = row.purchaseRequest?.requesterId ?? "-";
      const current = row.teamUsers.length ? row.teamUsers.map((link) => link.userId).join(",") : "null";
      const requestId = row.purchaseRequestId ?? "-";
      const title = row.purchaseRequest?.title ?? "-";
      console.log(
        `- tx=${row.id} | request=${requestId} | teamUserIds=${current} | expected=${expected} | title=${title}`
      );
    }
    if (invalidRows.length > 100) {
      console.log(`... va ${invalidRows.length - 100} dong khac`);
    }
  }

  if (!shouldFix) {
    console.log("\nDry run: khong cap nhat du lieu. Them --fix de sua tu dong.");
    return;
  }

  let updatedCount = 0;
  for (const row of invalidRows) {
    if (!row.purchaseRequest) continue;
    await prisma.transactionTeamUser.createMany({
      data: [{ transactionId: row.id, userId: row.purchaseRequest.requesterId }],
      skipDuplicates: true,
    });
    updatedCount += 1;
  }

  console.log(`\nDa cap nhat ${updatedCount} giao dich.`);
}

main()
  .catch((error) => {
    console.error("Script error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
