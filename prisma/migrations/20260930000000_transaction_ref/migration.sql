ALTER TABLE `transactions` ADD COLUMN `transaction_ref` VARCHAR(191) NULL;

-- Backfill from the payment note the purchase-request payout flow already writes.
UPDATE `transactions`
SET `transaction_ref` = TRIM(JSON_UNQUOTE(JSON_EXTRACT(`notes`, '$.paymentTransferNote')))
WHERE `notes` IS NOT NULL
  AND JSON_VALID(`notes`)
  AND JSON_TYPE(`notes`) = 'OBJECT'
  AND JSON_EXTRACT(`notes`, '$.paymentTransferNote') IS NOT NULL
  AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(`notes`, '$.paymentTransferNote'))) <> '';

CREATE INDEX `transactions_transaction_ref_idx` ON `transactions`(`transaction_ref`);
