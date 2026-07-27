-- Attendance / leave / shift policy alignment (company-wide holidays, results, ledgers)

-- Enums
CREATE TABLE IF NOT EXISTS `_enum_bootstrap` (`id` INT NOT NULL);
DROP TABLE IF EXISTS `_enum_bootstrap`;

-- MySQL enums via ALTER for Prisma-managed enums are applied by Prisma as separate types.
-- Use VARCHAR columns where safer for existing MySQL; Prisma client enums map in application layer.
-- Prisma MySQL typically creates ENUM columns — match schema.prisma.

ALTER TABLE `holidays`
  ADD COLUMN `description` TEXT NULL;

-- Normalize holidays to company-wide: clear branch scope and collapse duplicates later in app seed/job.
UPDATE `holidays` SET `branch_id` = NULL WHERE `branch_id` IS NOT NULL;

-- Drop FK and column for branch-scoped holidays
SET @fk := (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'holidays' AND COLUMN_NAME = 'branch_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE `holidays` DROP FOREIGN KEY `', @fk, '`'), 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `holidays` DROP COLUMN `branch_id`;

-- Deduplicate active holidays on same date+name (keep earliest)
DELETE h1 FROM `holidays` h1
INNER JOIN `holidays` h2
  ON h1.date = h2.date AND h1.name = h2.name AND h1.holiday_id > h2.holiday_id;

CREATE UNIQUE INDEX `holidays_date_name_key` ON `holidays`(`date`, `name`);
CREATE INDEX `holidays_date_status_idx` ON `holidays`(`date`, `status`);

CREATE TABLE `shift_definitions` (
  `shift_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `shift_type` ENUM('DAY', 'NIGHT') NOT NULL DEFAULT 'DAY',
  `start_minutes` INT NOT NULL,
  `end_minutes` INT NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`shift_id`),
  UNIQUE INDEX `shift_definitions_name_key`(`name`),
  UNIQUE INDEX `shift_definitions_code_key`(`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_shift_assignments` (
  `assignment_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `shift_id` VARCHAR(191) NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `assigned_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`assignment_id`),
  INDEX `employee_shift_assignments_employee_id_effective_from_idx`(`employee_id`, `effective_from`),
  INDEX `employee_shift_assignments_shift_id_idx`(`shift_id`),
  CONSTRAINT `employee_shift_assignments_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `employee_shift_assignments_shift_id_fkey`
    FOREIGN KEY (`shift_id`) REFERENCES `shift_definitions`(`shift_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `attendance_daily_summary`
  ADD COLUMN `attendance_result` ENUM('FULL_DAY','HALF_DAY','ABSENT','HOLIDAY','WEEKLY_OFF','PAID_LEAVE','UNPAID_LEAVE','PENDING') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `check_in_source` ENUM('BRANCH_MOBILE','MOBILE','THUMB_SCANNER','MANUAL','SYSTEM') NULL,
  ADD COLUMN `check_out_source` ENUM('BRANCH_MOBILE','MOBILE','THUMB_SCANNER','MANUAL','SYSTEM') NULL,
  ADD COLUMN `matched_branch_id` VARCHAR(191) NULL,
  ADD COLUMN `is_late` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `is_missed_checkout` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `is_locked` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `provisional_check_out_at` DATETIME(3) NULL,
  ADD COLUMN `correction_deadline_at` DATETIME(3) NULL;

CREATE INDEX `attendance_daily_summary_date_attendance_result_idx`
  ON `attendance_daily_summary`(`date`, `attendance_result`);
CREATE INDEX `attendance_daily_summary_is_locked_correction_deadline_at_idx`
  ON `attendance_daily_summary`(`is_locked`, `correction_deadline_at`);

ALTER TABLE `leave_requests`
  ADD COLUMN `session` ENUM('FULL','FIRST_HALF','SECOND_HALF') NOT NULL DEFAULT 'FULL',
  ADD COLUMN `medical_reminder_24h_sent_at` DATETIME(3) NULL,
  ADD COLUMN `medical_reminder_2h_sent_at` DATETIME(3) NULL,
  ADD COLUMN `medical_overdue_notified_at` DATETIME(3) NULL;

CREATE TABLE `leave_ledger_entries` (
  `entry_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `leave_type_id` VARCHAR(191) NOT NULL,
  `entry_type` ENUM('ACCRUAL','USAGE','ADJUSTMENT','CARRY_FORWARD','EXPIRY','REVERSAL','REVOKE') NOT NULL,
  `amount` DECIMAL(8, 2) NOT NULL,
  `balance_after` DECIMAL(8, 2) NOT NULL,
  `effective_date` DATE NOT NULL,
  `reference_type` VARCHAR(80) NULL,
  `reference_id` VARCHAR(191) NULL,
  `note` TEXT NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`entry_id`),
  UNIQUE INDEX `leave_ledger_entries_employee_id_leave_type_id_entry_type_effective_date_reference_id_key`
    (`employee_id`, `leave_type_id`, `entry_type`, `effective_date`, `reference_id`),
  INDEX `leave_ledger_entries_employee_id_leave_type_id_created_at_idx`(`employee_id`, `leave_type_id`, `created_at`),
  INDEX `leave_ledger_entries_reference_type_reference_id_idx`(`reference_type`, `reference_id`),
  CONSTRAINT `leave_ledger_entries_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `leave_ledger_entries_leave_type_id_fkey`
    FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`leave_type_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `comp_off_credits`
  ADD COLUMN `revoked_at` DATETIME(3) NULL,
  ADD COLUMN `revoke_reason` VARCHAR(500) NULL,
  ADD COLUMN `expired_at` DATETIME(3) NULL;

CREATE INDEX `comp_off_credits_employee_id_revoked_at_expired_at_idx`
  ON `comp_off_credits`(`employee_id`, `revoked_at`, `expired_at`);

ALTER TABLE `attendance_correction_requests`
  ADD COLUMN `decision_note` TEXT NULL,
  ADD COLUMN `employee_window_ends_at` DATETIME(3) NULL,
  ADD COLUMN `is_hr_only` BOOLEAN NOT NULL DEFAULT false;

-- Seed morning shift definitions (idempotent)
INSERT INTO `shift_definitions` (`shift_id`, `name`, `code`, `shift_type`, `start_minutes`, `end_minutes`, `active`, `created_at`, `updated_at`)
VALUES
  ('shift-morning-0900', 'Morning 09:00–18:00', 'MORNING_0900', 'DAY', 540, 1080, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('shift-morning-0930', 'Morning 09:30–18:30', 'MORNING_0930', 'DAY', 570, 1110, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `start_minutes` = VALUES(`start_minutes`),
  `end_minutes` = VALUES(`end_minutes`),
  `active` = true,
  `updated_at` = CURRENT_TIMESTAMP(3);

-- Backfill assignments for employees whose minutes match a catalog shift (idempotent)
INSERT INTO `employee_shift_assignments` (
  `assignment_id`, `employee_id`, `shift_id`, `effective_from`, `effective_to`, `assigned_by`, `created_at`, `updated_at`
)
SELECT
  CONCAT('assign-', e.`employee_id`),
  e.`employee_id`,
  s.`shift_id`,
  COALESCE(e.`joining_date`, CURDATE()),
  NULL,
  NULL,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `employees` e
INNER JOIN `shift_definitions` s
  ON s.`shift_type` = e.`shift_type`
 AND s.`start_minutes` = e.`shift_start_minutes`
 AND s.`end_minutes` = e.`shift_end_minutes`
 AND s.`active` = true
WHERE NOT EXISTS (
  SELECT 1 FROM `employee_shift_assignments` a WHERE a.`employee_id` = e.`employee_id`
);

-- Comp Off must require Reporting Head approval going forward
UPDATE `leave_types` SET `approval_required` = true WHERE `code` = 'COMP_OFF';
