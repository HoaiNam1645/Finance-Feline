CREATE TABLE `currency_conversions` (
    `id` VARCHAR(191) NOT NULL,
    `wallet_name` VARCHAR(191) NOT NULL,
    `bank_name` VARCHAR(191) NOT NULL,
    `account_number` VARCHAR(191) NOT NULL,
    `owner_name` VARCHAR(191) NOT NULL,
    `amount_usd` DECIMAL(20, 4) NOT NULL,
    `pingpong_image_path` VARCHAR(512) NOT NULL,
    `pingpong_image_name` VARCHAR(255) NOT NULL,
    `pingpong_image_mime_type` VARCHAR(191) NOT NULL,
    `pingpong_image_size` INTEGER NOT NULL,
    `transfer_image_path` VARCHAR(512) NOT NULL,
    `transfer_image_name` VARCHAR(255) NOT NULL,
    `transfer_image_mime_type` VARCHAR(191) NOT NULL,
    `transfer_image_size` INTEGER NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `currency_conversions_created_at_idx`(`created_at`),
    INDEX `currency_conversions_created_by_idx`(`created_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `currency_conversion_requests` (
    `conversion_id` VARCHAR(191) NOT NULL,
    `purchase_request_id` VARCHAR(191) NOT NULL,

    INDEX `currency_conversion_requests_purchase_request_id_idx`(`purchase_request_id`),
    PRIMARY KEY (`conversion_id`, `purchase_request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `currency_conversions` ADD CONSTRAINT `currency_conversions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `currency_conversion_requests` ADD CONSTRAINT `currency_conversion_requests_conversion_id_fkey` FOREIGN KEY (`conversion_id`) REFERENCES `currency_conversions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `currency_conversion_requests` ADD CONSTRAINT `currency_conversion_requests_purchase_request_id_fkey` FOREIGN KEY (`purchase_request_id`) REFERENCES `purchase_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
