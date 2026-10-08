CREATE TABLE `external_parties` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'OTHER',
  `contact_name` VARCHAR(191) NULL,
  `contact_phone` VARCHAR(50) NULL,
  `contact_email` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `external_parties_is_active_name_idx`(`is_active`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `external_receivables` (
  `id` VARCHAR(191) NOT NULL,
  `party_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `amount_original` DECIMAL(20, 4) NOT NULL,
  `currency_code` VARCHAR(191) NOT NULL,
  `exchange_rate_to_vnd` DECIMAL(20, 4) NOT NULL,
  `amount_vnd` DECIMAL(20, 4) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `due_date` DATETIME(3) NULL,
  `status` ENUM('OPEN', 'PARTIAL', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  `created_by` VARCHAR(191) NOT NULL,
  `cancelled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `external_receivables_party_id_status_idx`(`party_id`, `status`),
  INDEX `external_receivables_status_occurred_at_idx`(`status`, `occurred_at`),
  INDEX `external_receivables_created_by_idx`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `external_receivable_payments` (
  `id` VARCHAR(191) NOT NULL,
  `receivable_id` VARCHAR(191) NOT NULL,
  `amount_original` DECIMAL(20, 4) NOT NULL,
  `currency_code` VARCHAR(191) NOT NULL,
  `exchange_rate_to_vnd` DECIMAL(20, 4) NOT NULL,
  `amount_vnd` DECIMAL(20, 4) NOT NULL,
  `payment_date` DATETIME(3) NOT NULL,
  `payment_account_id` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `receipt_image_path` VARCHAR(512) NULL,
  `receipt_image_name` VARCHAR(255) NULL,
  `receipt_image_mime_type` VARCHAR(191) NULL,
  `receipt_image_size` INTEGER NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `external_receivable_payments_receivable_id_payment_date_idx`(`receivable_id`, `payment_date`),
  INDEX `external_receivable_payments_payment_account_id_idx`(`payment_account_id`),
  INDEX `external_receivable_payments_created_by_idx`(`created_by`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `external_receivables`
  ADD CONSTRAINT `external_receivables_party_id_fkey`
  FOREIGN KEY (`party_id`) REFERENCES `external_parties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `external_receivables_currency_code_fkey`
  FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `external_receivables_created_by_fkey`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `external_receivable_payments`
  ADD CONSTRAINT `external_receivable_payments_receivable_id_fkey`
  FOREIGN KEY (`receivable_id`) REFERENCES `external_receivables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `external_receivable_payments_currency_code_fkey`
  FOREIGN KEY (`currency_code`) REFERENCES `currencies`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `external_receivable_payments_payment_account_id_fkey`
  FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `external_receivable_payments_created_by_fkey`
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
