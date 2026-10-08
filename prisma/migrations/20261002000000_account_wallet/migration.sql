ALTER TABLE `purchase_requests`
  ADD COLUMN `is_wallet_stock` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `wallet_owner_id` VARCHAR(191) NULL,
  ADD COLUMN `wallet_source_request_id` VARCHAR(191) NULL;

CREATE INDEX `purchase_requests_wallet_owner_id_idx` ON `purchase_requests`(`wallet_owner_id`);
CREATE INDEX `purchase_requests_wallet_source_request_id_idx` ON `purchase_requests`(`wallet_source_request_id`);

ALTER TABLE `purchase_requests`
  ADD CONSTRAINT `purchase_requests_wallet_owner_id_fkey`
  FOREIGN KEY (`wallet_owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `purchase_requests_wallet_source_request_id_fkey`
  FOREIGN KEY (`wallet_source_request_id`) REFERENCES `purchase_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
