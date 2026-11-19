ALTER TABLE `transaction_categories`
  MODIFY `type` ENUM('INCOME', 'EXPENSE', 'BOTH') NOT NULL;
