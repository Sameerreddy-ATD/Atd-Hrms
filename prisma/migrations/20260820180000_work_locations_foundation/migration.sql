-- Module 2: Work Location foundation (evolve branches in place) + Base Office history.
-- Preserves branch_id, employee.home_branch_id, attendance_events.branch_id.

-- Structured address + type + timezone on branches
ALTER TABLE `branches`
  ADD COLUMN `address_line1` VARCHAR(191) NULL,
  ADD COLUMN `address_line2` VARCHAR(191) NULL,
  ADD COLUMN `locality` VARCHAR(120) NULL,
  ADD COLUMN `state` VARCHAR(40) NULL,
  ADD COLUMN `postal_code` VARCHAR(12) NULL,
  ADD COLUMN `country` VARCHAR(80) NOT NULL DEFAULT 'India',
  ADD COLUMN `location_type` VARCHAR(20) NOT NULL DEFAULT 'BRANCH',
  ADD COLUMN `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0;

-- Backfill structured fields from legacy address/city; preserve radius & coords.
UPDATE `branches`
SET
  `address_line1` = COALESCE(NULLIF(TRIM(`address`), ''), `branch_name`),
  `city` = COALESCE(NULLIF(TRIM(`city`), ''), 'Hyderabad'),
  `state` = 'TELANGANA',
  `postal_code` = COALESCE(`postal_code`, '500001'),
  `country` = 'India',
  `location_type` = CASE WHEN `is_hub` = 1 THEN 'PARKING_HUB' ELSE 'OFFICE' END,
  `timezone` = 'Asia/Kolkata';

-- Normalize hub mirror
UPDATE `branches` SET `is_hub` = 1 WHERE `location_type` = 'PARKING_HUB';
UPDATE `branches` SET `is_hub` = 0 WHERE `location_type` <> 'PARKING_HUB';

CREATE INDEX `branches_status_type_idx` ON `branches`(`status`, `location_type`);

CREATE TABLE `employee_work_location_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `location_id` VARCHAR(191) NOT NULL,
  `assignment_type` VARCHAR(30) NOT NULL DEFAULT 'BASE_OFFICE',
  `is_primary` BOOLEAN NOT NULL DEFAULT true,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `changed_by_user_id` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `ewla_employee_primary_idx`(`employee_id`, `assignment_type`, `is_primary`, `effective_from`, `effective_to`),
  INDEX `ewla_location_effective_idx`(`location_id`, `effective_from`, `effective_to`),
  CONSTRAINT `employee_work_location_assignments_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `employee_work_location_assignments_location_id_fkey`
    FOREIGN KEY (`location_id`) REFERENCES `branches`(`branch_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed current Base Office snapshot into history (open-ended primary assignments).
INSERT INTO `employee_work_location_assignments` (
  `id`, `employee_id`, `location_id`, `assignment_type`, `is_primary`,
  `effective_from`, `effective_to`, `changed_by_user_id`, `reason`, `created_at`, `updated_at`
)
SELECT
  CONCAT('ewla_', REPLACE(UUID(), '-', '')),
  e.`employee_id`,
  e.`home_branch_id`,
  'BASE_OFFICE',
  true,
  COALESCE(e.`joining_date`, CURDATE()),
  NULL,
  NULL,
  'Module 2 backfill from home_branch_id',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `employees` e
WHERE e.`home_branch_id` IS NOT NULL;
