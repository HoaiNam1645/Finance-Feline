import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "../lib/env";

const pool = new Pool({ connectionString: env.databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["error"] });

type CandidateRow = {
  id: string;
  teamUserId: string | null;
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
      teamUserId: true,
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

  const invalidRows = rows.filter((row) => {
    if (!row.purchaseRequest) return false;
    return row.teamUserId !== row.purchaseRequest.requesterId;
  });

  const missingRows = invalidRows.filter((row) => row.teamUserId == null);
  const mismatchedRows = invalidRows.filter((row) => row.teamUserId != null);

  console.log(`Tong giao dich co purchase request: ${rows.length}`);
  console.log(`Giao dich sai teamUserId: ${invalidRows.length}`);
  console.log(`- Chua co teamUserId: ${missingRows.length}`);
  console.log(`- Co teamUserId nhung sai requesterId: ${mismatchedRows.length}`);

  if (invalidRows.length > 0) {
    console.log("\nDanh sach giao dich sai (toi da 100 dong):");
    for (const row of invalidRows.slice(0, 100)) {
      const expected = row.purchaseRequest?.requesterId ?? "-";
      const current = row.teamUserId ?? "null";
      const requestId = row.purchaseRequestId ?? "-";
      const title = row.purchaseRequest?.title ?? "-";
      console.log(
        `- tx=${row.id} | request=${requestId} | teamUserId=${current} | expected=${expected} | title=${title}`
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
    await prisma.transaction.update({
      where: { id: row.id },
      data: {
        teamUserId: row.purchaseRequest.requesterId,
      },
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
    await pool.end();
  });
