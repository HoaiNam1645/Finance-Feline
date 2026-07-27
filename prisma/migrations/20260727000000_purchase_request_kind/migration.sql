-- AlterTable
ALTER TABLE `purchase_requests` ADD COLUMN `kind` ENUM('PURCHASE', 'COLLECTION') NOT NULL DEFAULT 'PURCHASE';

-- CreateIndex
CREATE INDEX `purchase_requests_kind_status_idx` ON `purchase_requests`(`kind`, `status`);
