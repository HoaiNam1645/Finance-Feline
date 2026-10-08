ALTER TABLE `currency_conversions`
  ADD COLUMN `receive_payment_account_id` VARCHAR(191) NULL,
  ADD COLUMN `amount_vnd` DECIMAL(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN `notes` TEXT NULL,
  ADD COLUMN `transfer_transaction_id` VARCHAR(191) NULL,
  ADD COLUMN `receive_transaction_id` VARCHAR(191) NULL;

ALTER TABLE `currency_conversions` ALTER COLUMN `amount_vnd` DROP DEFAULT;

CREATE INDEX `currency_conversions_receive_payment_account_id_idx` ON `currency_conversions`(`receive_payment_account_id`);

ALTER TABLE `currency_conversions`
  ADD CONSTRAINT `currency_conversions_receive_payment_account_id_fkey`
  FOREIGN KEY (`receive_payment_account_id`) REFERENCES `payment_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
