ALTER TABLE `transaction_categories` ADD COLUMN `contact_email` VARCHAR(191) NULL;
ALTER TABLE `purchase_requests` ADD COLUMN `workshop_email` VARCHAR(191) NULL;
ALTER TABLE `transactions` ADD COLUMN `workshop_email` VARCHAR(191) NULL;
