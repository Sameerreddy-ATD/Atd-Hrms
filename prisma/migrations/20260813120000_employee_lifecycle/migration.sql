-- Employee personal / lifecycle fields
ALTER TABLE `employees`
  ADD COLUMN `father_name` VARCHAR(191) NULL,
  ADD COLUMN `present_address` TEXT NULL,
  ADD COLUMN `present_city` VARCHAR(191) NULL,
  ADD COLUMN `present_state` VARCHAR(191) NULL,
  ADD COLUMN `present_pincode` VARCHAR(12) NULL,
  ADD COLUMN `permanent_address` TEXT NULL,
  ADD COLUMN `permanent_city` VARCHAR(191) NULL,
  ADD COLUMN `permanent_state` VARCHAR(191) NULL,
  ADD COLUMN `permanent_pincode` VARCHAR(12) NULL,
  ADD COLUMN `lifecycle_stage` VARCHAR(24) NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX `employees_lifecycle_stage_status_idx` ON `employees`(`lifecycle_stage`, `status`);

-- Jobs / candidates
ALTER TABLE `recruitment_jobs`
  ADD COLUMN `employment_type` VARCHAR(24) NULL,
  ADD COLUMN `openings` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `candidates`
  ADD COLUMN `source` VARCHAR(191) NULL,
  ADD COLUMN `resume_file_name` VARCHAR(191) NULL,
  ADD COLUMN `resume_storage_key` VARCHAR(191) NULL,
  ADD COLUMN `current_ctc` DECIMAL(12, 2) NULL,
  ADD COLUMN `expected_ctc` DECIMAL(12, 2) NULL,
  ADD COLUMN `notice_days` INTEGER NULL;

-- PMS
ALTER TABLE `appraisal_reviews`
  ADD COLUMN `employee_comment` TEXT NULL,
  ADD COLUMN `manager_comment` TEXT NULL,
  ADD COLUMN `skip_level_user_id` VARCHAR(191) NULL,
  ADD COLUMN `skip_level_comment` TEXT NULL,
  ADD COLUMN `skip_level_approved_at` DATETIME(3) NULL,
  ADD COLUMN `signed_off_at` DATETIME(3) NULL,
  ADD COLUMN `signed_off_by_user_id` VARCHAR(191) NULL;

-- LMS
ALTER TABLE `sop_articles`
  ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT 'SOP',
  ADD COLUMN `category` VARCHAR(191) NULL,
  ADD COLUMN `file_name` VARCHAR(191) NULL,
  ADD COLUMN `storage_key` VARCHAR(191) NULL;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sop_articles' AND INDEX_NAME = 'sop_articles_published_updated_at_idx'
);
SET @sqlstmt := IF(@exist > 0, 'DROP INDEX `sop_articles_published_updated_at_idx` ON `sop_articles`', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sop_articles' AND INDEX_NAME = 'sop_articles_published_kind_updated_at_idx'
);
SET @sqlstmt := IF(
  @exist = 0,
  'CREATE INDEX `sop_articles_published_kind_updated_at_idx` ON `sop_articles`(`published`, `kind`, `updated_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE `performance_goals` (
  `goal_id` VARCHAR(191) NOT NULL,
  `review_id` VARCHAR(191) NOT NULL,
  `kra` VARCHAR(191) NOT NULL,
  `kpi` TEXT NOT NULL,
  `target_percent` DECIMAL(6, 2) NOT NULL DEFAULT 100,
  `achieved_percent` DECIMAL(6, 2) NULL,
  `employee_comment` TEXT NULL,
  `manager_comment` TEXT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `performance_goals_review_id_sort_order_idx`(`review_id`, `sort_order`),
  PRIMARY KEY (`goal_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `candidate_interviews` (
  `interview_id` VARCHAR(191) NOT NULL,
  `candidate_id` VARCHAR(191) NOT NULL,
  `round_name` VARCHAR(191) NOT NULL,
  `scheduled_at` DATETIME(3) NULL,
  `interviewer_name` VARCHAR(191) NULL,
  `interviewer_user_id` VARCHAR(191) NULL,
  `outcome` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED',
  `score` INTEGER NULL,
  `feedback` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `candidate_interviews_candidate_id_scheduled_at_idx`(`candidate_id`, `scheduled_at`),
  PRIMARY KEY (`interview_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `offer_letters` (
  `offer_id` VARCHAR(191) NOT NULL,
  `candidate_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NULL,
  `ctc_annual` DECIMAL(12, 2) NOT NULL,
  `designation` VARCHAR(191) NULL,
  `joining_date` DATE NULL,
  `body` TEXT NULL,
  `file_name` VARCHAR(191) NULL,
  `storage_key` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
  `sent_at` DATETIME(3) NULL,
  `signed_at` DATETIME(3) NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `offer_letters_candidate_id_status_idx`(`candidate_id`, `status`),
  INDEX `offer_letters_employee_id_idx`(`employee_id`),
  PRIMARY KEY (`offer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `onboarding_cases` (
  `case_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `candidate_id` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PRE_ONBOARDING',
  `started_by_user_id` VARCHAR(191) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `onboarding_cases_employee_id_status_idx`(`employee_id`, `status`),
  PRIMARY KEY (`case_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `onboarding_documents` (
  `document_id` VARCHAR(191) NOT NULL,
  `case_id` VARCHAR(191) NOT NULL,
  `doc_type` VARCHAR(24) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `file_name` VARCHAR(191) NULL,
  `storage_key` VARCHAR(191) NULL,
  `employee_notes` TEXT NULL,
  `verified_by_user_id` VARCHAR(191) NULL,
  `verified_at` DATETIME(3) NULL,
  `signed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `onboarding_documents_case_id_doc_type_key`(`case_id`, `doc_type`),
  PRIMARY KEY (`document_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `new_hire_profiles` (
  `profile_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `full_name` VARCHAR(191) NULL,
  `father_name` VARCHAR(191) NULL,
  `date_of_birth` DATE NULL,
  `age_years` INTEGER NULL,
  `gender` VARCHAR(191) NULL,
  `present_address` TEXT NULL,
  `present_city` VARCHAR(191) NULL,
  `present_state` VARCHAR(191) NULL,
  `present_pincode` VARCHAR(12) NULL,
  `permanent_address` TEXT NULL,
  `permanent_city` VARCHAR(191) NULL,
  `permanent_state` VARCHAR(191) NULL,
  `permanent_pincode` VARCHAR(12) NULL,
  `pan_number` VARCHAR(191) NULL,
  `aadhaar_last4` VARCHAR(4) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
  `submitted_at` DATETIME(3) NULL,
  `verified_at` DATETIME(3) NULL,
  `verified_by_user_id` VARCHAR(191) NULL,
  `hr_notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `new_hire_profiles_employee_id_key`(`employee_id`),
  PRIMARY KEY (`profile_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_compensation` (
  `compensation_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `effective_from` DATE NOT NULL,
  `ctc_annual` DECIMAL(12, 2) NOT NULL,
  `basic_monthly` DECIMAL(12, 2) NULL,
  `notes` TEXT NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `employee_compensation_employee_id_effective_from_idx`(`employee_id`, `effective_from`),
  PRIMARY KEY (`compensation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `recurring_allowances` (
  `allowance_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `amount_monthly` DECIMAL(12, 2) NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `recurring_allowances_employee_id_status_idx`(`employee_id`, `status`),
  PRIMARY KEY (`allowance_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `one_time_payments` (
  `payment_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `payment_date` DATE NOT NULL,
  `reason` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `one_time_payments_employee_id_payment_date_idx`(`employee_id`, `payment_date`),
  PRIMARY KEY (`payment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shift_swap_requests` (
  `swap_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `counterpart_employee_id` VARCHAR(191) NOT NULL,
  `work_date` DATE NOT NULL,
  `reason` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `reviewed_by_user_id` VARCHAR(191) NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `shift_swap_requests_employee_id_work_date_idx`(`employee_id`, `work_date`),
  INDEX `shift_swap_requests_counterpart_employee_id_work_date_idx`(`counterpart_employee_id`, `work_date`),
  PRIMARY KEY (`swap_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_change_requests` (
  `change_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(40) NOT NULL,
  `effective_date` DATE NOT NULL,
  `payload` JSON NOT NULL,
  `reason` TEXT NULL,
  `hr_letter_file_name` VARCHAR(191) NULL,
  `hr_letter_storage_key` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_HR',
  `requested_by_user_id` VARCHAR(191) NOT NULL,
  `manager_approved_by_id` VARCHAR(191) NULL,
  `manager_approved_at` DATETIME(3) NULL,
  `hr_approved_by_id` VARCHAR(191) NULL,
  `hr_approved_at` DATETIME(3) NULL,
  `applied_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `employee_change_requests_employee_id_status_idx`(`employee_id`, `status`),
  INDEX `employee_change_requests_kind_status_idx`(`kind`, `status`),
  PRIMARY KEY (`change_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `offboarding_cases` (
  `case_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(24) NOT NULL,
  `end_date` DATE NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
  `access_removed_at` DATETIME(3) NULL,
  `assets_cleared_at` DATETIME(3) NULL,
  `no_dues_at` DATETIME(3) NULL,
  `resignation_letter_key` VARCHAR(191) NULL,
  `resignation_letter_name` VARCHAR(191) NULL,
  `experience_letter_key` VARCHAR(191) NULL,
  `experience_letter_name` VARCHAR(191) NULL,
  `intern_certificate_key` VARCHAR(191) NULL,
  `intern_certificate_name` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `started_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `offboarding_cases_employee_id_status_idx`(`employee_id`, `status`),
  PRIMARY KEY (`case_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `performance_goals`
  ADD CONSTRAINT `performance_goals_review_id_fkey`
  FOREIGN KEY (`review_id`) REFERENCES `appraisal_reviews`(`review_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `candidate_interviews`
  ADD CONSTRAINT `candidate_interviews_candidate_id_fkey`
  FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`candidate_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `offer_letters`
  ADD CONSTRAINT `offer_letters_candidate_id_fkey`
  FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`candidate_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `offer_letters_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `onboarding_cases`
  ADD CONSTRAINT `onboarding_cases_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `onboarding_documents`
  ADD CONSTRAINT `onboarding_documents_case_id_fkey`
  FOREIGN KEY (`case_id`) REFERENCES `onboarding_cases`(`case_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `new_hire_profiles`
  ADD CONSTRAINT `new_hire_profiles_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_compensation`
  ADD CONSTRAINT `employee_compensation_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `recurring_allowances`
  ADD CONSTRAINT `recurring_allowances_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `one_time_payments`
  ADD CONSTRAINT `one_time_payments_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `shift_swap_requests`
  ADD CONSTRAINT `shift_swap_requests_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `shift_swap_requests_counterpart_employee_id_fkey`
  FOREIGN KEY (`counterpart_employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_change_requests`
  ADD CONSTRAINT `employee_change_requests_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `offboarding_cases`
  ADD CONSTRAINT `offboarding_cases_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;
