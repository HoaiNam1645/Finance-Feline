ALTER TABLE `currency_conversions`
  ADD COLUMN `status` ENUM('PENDING', 'FAILED', 'SUCCEEDED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `decided_by` VARCHAR(191) NULL,
  ADD COLUMN `decided_at` DATETIME(3) NULL;

CREATE INDEX `currency_conversions_status_created_at_idx` ON `currency_conversions`(`status`, `created_at`);
CREATE INDEX `currency_conversions_decided_by_idx` ON `currency_conversions`(`decided_by`);

ALTER TABLE `currency_conversions`
  ADD CONSTRAINT `currency_conversions_decided_by_fkey`
  FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
