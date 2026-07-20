import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../lib/env";

const adapter = new PrismaMariaDb(env.databaseUrl);
const prisma = new PrismaClient({ adapter, log: ["error"] });

/**
 * Sửa thủ công vài yêu cầu mua bị thao tác nhầm.
 *
 * Dùng:
 *   tsx scripts/fix-purchase-requests.ts --ids=<id1>,<id2> [--category="Ykien Request"]
 *        [--revert-paid] [--purge-logs] [--fix]
 *
 * Mặc định là DRY RUN (chỉ in ra dự định làm gì). Thêm --fix mới ghi vào DB.
 */

function getArg(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(flag: string) {
  return process.argv.includes(`--${flag}`);
}

async function main() {
  const shouldFix = hasFlag("fix");
  const revertPaid = hasFlag("revert-paid");
  const purgeLogs = hasFlag("purge-logs");
  const categoryName = getArg("category");
  const idsRaw = getArg("ids");

  if (!idsRaw) {
    console.log("Thieu --ids=<id1>,<id2>. Liet ke 10 yeu cau mua moi nhat de ban lay id:\n");
    const recent = await prisma.purchaseRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        category: { select: { name: true } },
        transactions: { select: { id: true } },
      },
    });
    for (const row of recent) {
      console.log(
        `- id=${row.id} | ${row.status} | danh muc=${row.category?.name ?? "-"} | tx=${row.transactions.length} | ${row.title} / ${row.description}`
      );
    }
    return;
  }

  const ids = idsRaw.split(",").map((item) => item.trim()).filter(Boolean);

  let targetCategoryId: string | null = null;
  if (categoryName) {
    const category = await prisma.transactionCategory.findFirst({
      where: { name: categoryName, isActive: true },
      select: { id: true, name: true, type: true },
    });
    if (!category) {
      console.error(`Khong tim thay danh muc dang hoat dong ten "${categoryName}". Dung lai.`);
      process.exitCode = 1;
      return;
    }
    targetCategoryId = category.id;
    console.log(`Danh muc dich: ${category.name} (${category.type}) id=${category.id}\n`);
  }

  for (const id of ids) {
    const row = await prisma.purchaseRequest.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        categoryId: true,
        category: { select: { name: true } },
        transactions: { select: { id: true, description: true, amountVnd: true } },
      },
    });

    if (!row) {
      console.log(`! id=${id} khong ton tai, bo qua.`);
      continue;
    }

    console.log(`\n=== ${row.title} / ${row.description}`);
    console.log(`    id=${row.id} | trang thai=${row.status} | danh muc=${row.category?.name ?? "-"}`);
    console.log(`    giao dich lien quan: ${row.transactions.length}`);

    // 1) Revert thanh toan: xoa giao dich do viec "pay" sinh ra, tra trang thai ve APPROVED.
    if (revertPaid) {
      if (row.status !== "PAID") {
        console.log(`    [revert] bo qua: trang thai dang ${row.status}, khong phai PAID.`);
      } else {
        console.log(`    [revert] se xoa ${row.transactions.length} giao dich va dat lai trang thai -> APPROVED`);
        for (const tx of row.transactions) {
          console.log(`             - tx=${tx.id} | ${Number(tx.amountVnd).toLocaleString("vi-VN")} VND | ${tx.description.split("\n")[0]}`);
        }
        if (shouldFix) {
          await prisma.$transaction(async (db) => {
            // Go lien ket anh chung tu khoi giao dich truoc khi xoa (giu anh lai cho yeu cau mua).
            await db.receiptImage.updateMany({
              where: { transactionId: { in: row.transactions.map((tx) => tx.id) } },
              data: { transactionId: null },
            });
            await db.transaction.deleteMany({
              where: { id: { in: row.transactions.map((tx) => tx.id) } },
            });
            await db.purchaseRequest.update({
              where: { id: row.id },
              data: { status: "APPROVED" },
            });
          });
          console.log(`    [revert] DA XU LY.`);
        }
      }
    }

    // 2) Doi danh muc.
    if (targetCategoryId) {
      if (row.categoryId === targetCategoryId) {
        console.log(`    [danh muc] da dung roi, bo qua.`);
      } else {
        console.log(`    [danh muc] ${row.category?.name ?? "-"} -> ${categoryName}`);
        if (shouldFix) {
          await prisma.purchaseRequest.update({
            where: { id: row.id },
            data: { categoryId: targetCategoryId },
          });
          console.log(`    [danh muc] DA XU LY.`);
        }
      }
    }

    // 3) Xoa timeline (audit log) cua yeu cau mua + cac giao dich cua no.
    if (purgeLogs) {
      const entityIds = [row.id, ...row.transactions.map((tx) => tx.id)];
      const logCount = await prisma.auditLog.count({ where: { entityId: { in: entityIds } } });
      console.log(`    [timeline] se xoa ${logCount} dong log (entityId thuoc yeu cau mua + giao dich cua no)`);
      if (shouldFix) {
        await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
        console.log(`    [timeline] DA XU LY.`);
      }
    }
  }

  if (!shouldFix) {
    console.log("\n--- DRY RUN: chua ghi gi vao DB. Them --fix de thuc thi. ---");
  } else {
    console.log("\n--- DA GHI VAO DB. ---");
  }
}

main()
  .catch((error) => {
    console.error("Script error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
