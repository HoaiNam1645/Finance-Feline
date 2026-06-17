-- CreateTable
CREATE TABLE `transaction_team_users` (
    `transaction_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,

    INDEX `transaction_team_users_user_id_idx`(`user_id`),
    PRIMARY KEY (`transaction_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `transaction_team_users` ADD CONSTRAINT `transaction_team_users_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transaction_team_users` ADD CONSTRAINT `transaction_team_users_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single team user assignments into the join table
INSERT INTO `transaction_team_users` (`transaction_id`, `user_id`)
SELECT `id`, `team_user_id` FROM `transactions` WHERE `team_user_id` IS NOT NULL;

-- DropForeignKey
ALTER TABLE `transactions` DROP FOREIGN KEY `transactions_team_user_id_fkey`;

-- DropIndex
DROP INDEX `transactions_team_user_id_transaction_date_idx` ON `transactions`;

-- AlterTable
ALTER TABLE `transactions` DROP COLUMN `team_user_id`;
