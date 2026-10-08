ALTER TABLE `currency_conversions` ADD COLUMN `wallet_payment_account_id` VARCHAR(191) NULL;

CREATE INDEX `currency_conversions_wallet_payment_account_id_idx` ON `currency_conversions`(`wallet_payment_account_id`);

ALTER TABLE `currency_conversions`
  ADD CONSTRAINT `currency_conversions_wallet_payment_account_id_fkey`
  FOREIGN KEY (`wallet_payment_account_id`) REFERENCES `payment_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
