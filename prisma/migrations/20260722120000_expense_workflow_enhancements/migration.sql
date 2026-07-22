ALTER TABLE `expense_claims`
  ADD COLUMN `claim_type` VARCHAR(191) NOT NULL DEFAULT 'EXPENSE' AFTER `employee_id`,
  ADD COLUMN `title` VARCHAR(191) NULL AFTER `claim_type`,
  ADD COLUMN `remark` TEXT NULL AFTER `description`,
  MODIFY `category` VARCHAR(191) NULL,
  MODIFY `expense_date` DATE NULL,
  MODIFY `description` TEXT NULL;

UPDATE `expense_claims`
SET `title` = CONCAT(
  UPPER(SUBSTRING(REPLACE(`category`, '_', ' '), 1, 1)),
  LOWER(SUBSTRING(REPLACE(`category`, '_', ' '), 2))
)
WHERE `title` IS NULL;

UPDATE `expense_claims` SET `status` = 'UNPAID' WHERE `status` = 'APPROVED';
