-- Multi-seat asset assignments, employee visibility, drop unused vehicle fields from company assets.

CREATE TABLE IF NOT EXISTS `asset_assignments` (
  `assignment_id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `visible_to_employee` BOOLEAN NOT NULL DEFAULT true,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `returned_at` DATETIME(3) NULL,
  `cost_share_amount` DECIMAL(12, 2) NOT NULL,
  `cost_share_frequency` ENUM('ONE_TIME', 'MONTHLY', 'YEARLY') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`assignment_id`),
  INDEX `asset_assignments_asset_id_returned_at_idx` (`asset_id`, `returned_at`),
  INDEX `asset_assignments_employee_id_returned_at_idx` (`employee_id`, `returned_at`),
  INDEX `asset_assignments_employee_id_visible_to_employee_returned_at_idx` (`employee_id`, `visible_to_employee`, `returned_at`),
  CONSTRAINT `asset_assignments_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `company_assets`(`asset_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `asset_assignments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill one assignment per currently assigned asset.
INSERT INTO `asset_assignments` (
  `assignment_id`,
  `asset_id`,
  `employee_id`,
  `visible_to_employee`,
  `assigned_at`,
  `returned_at`,
  `cost_share_amount`,
  `cost_share_frequency`,
  `created_at`,
  `updated_at`
)
SELECT
  CONCAT('asgn_', `asset_id`),
  `asset_id`,
  `assigned_employee_id`,
  true,
  `created_at`,
  NULL,
  `purchase_value`,
  `cost_frequency`,
  NOW(3),
  NOW(3)
FROM `company_assets`
WHERE `assigned_employee_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `asset_assignments` aa WHERE aa.`asset_id` = `company_assets`.`asset_id` AND aa.`returned_at` IS NULL
  );

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company_assets' AND COLUMN_NAME = 'vehicle_registration'
);
SET @sqlstmt := IF(@exists > 0,
  'ALTER TABLE `company_assets` DROP COLUMN `vehicle_registration`',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company_assets' AND COLUMN_NAME = 'insurance_expiry'
);
SET @sqlstmt := IF(@exists > 0,
  'ALTER TABLE `company_assets` DROP COLUMN `insurance_expiry`',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company_assets' AND COLUMN_NAME = 'fitness_expiry'
);
SET @sqlstmt := IF(@exists > 0,
  'ALTER TABLE `company_assets` DROP COLUMN `fitness_expiry`',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
