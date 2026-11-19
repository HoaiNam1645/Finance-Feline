ALTER TABLE `currency_conversions`
  ADD COLUMN `actual_received_usd` DECIMAL(20, 4) NULL AFTER `amount_usd`;
