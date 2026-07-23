ALTER TABLE `leave_types`
  ADD COLUMN `code` VARCHAR(191) NULL,
  ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN `annual_allowance` DECIMAL(8,2) NULL,
  ADD COLUMN `monthly_credit` DECIMAL(8,2) NULL,
  ADD COLUMN `max_per_month` DECIMAL(8,2) NULL,
  ADD COLUMN `carry_forward` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `requires_medical_document` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `approval_required` BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE `leave_balances`
  ADD COLUMN `manual_adjustment` DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN `calculation_year` INTEGER NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

ALTER TABLE `leave_requests`
  ADD COLUMN `medical_document_url` TEXT NULL,
  ADD COLUMN `medical_document_due_at` DATETIME(3) NULL,
  ADD COLUMN `medical_document_verified_at` DATETIME(3) NULL,
  ADD COLUMN `medical_document_verified_by` VARCHAR(191) NULL;

CREATE TABLE `weekly_off_requests` (
  `weekly_off_request_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `date` DATE NOT NULL,
  `week_start` DATE NOT NULL,
  `approver_id` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reason` TEXT NULL,
  `reviewed_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`weekly_off_request_id`),
  UNIQUE INDEX `weekly_off_requests_employee_id_week_start_key` (`employee_id`, `week_start`),
  INDEX `weekly_off_requests_approver_id_status_date_idx` (`approver_id`, `status`, `date`),
  CONSTRAINT `weekly_off_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `comp_off_credits` (
  `comp_off_credit_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `earned_date` DATE NOT NULL,
  `holiday_id` VARCHAR(191) NULL,
  `consumed_by_leave_request_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`comp_off_credit_id`),
  UNIQUE INDEX `comp_off_credits_employee_id_earned_date_key` (`employee_id`, `earned_date`),
  INDEX `comp_off_credits_employee_id_consumed_by_leave_request_id_idx` (`employee_id`, `consumed_by_leave_request_id`),
  CONSTRAINT `comp_off_credits_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DELETE FROM `leave_requests`;
DELETE FROM `leave_balances`;
DELETE FROM `leave_types`;

INSERT INTO `leave_types`
  (`leave_type_id`, `name`, `code`, `paid`, `active`, `annual_allowance`, `monthly_credit`, `max_per_month`, `carry_forward`, `requires_medical_document`, `approval_required`)
VALUES
  ('leave-casual', 'Casual Leave', 'CASUAL', TRUE, TRUE, 12, 1, NULL, TRUE, FALSE, TRUE),
  ('leave-sick', 'Sick Leave', 'SICK', TRUE, TRUE, 6, NULL, 2, FALSE, TRUE, TRUE),
  ('leave-lop', 'Unpaid Leave / LOP', 'LOP', FALSE, TRUE, NULL, NULL, NULL, FALSE, FALSE, TRUE),
  ('leave-comp-off', 'Comp Off', 'COMP_OFF', TRUE, TRUE, NULL, NULL, NULL, FALSE, FALSE, FALSE);

ALTER TABLE `leave_types` MODIFY `code` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `leave_types_code_key` ON `leave_types`(`code`);
