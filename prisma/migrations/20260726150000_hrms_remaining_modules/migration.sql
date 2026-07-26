-- AlterTable (idempotent: prior partial apply may have added these columns)
SET @exist := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_claims' AND COLUMN_NAME = 'claim_meta'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `expense_claims` ADD COLUMN `claim_meta` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_tasks' AND COLUMN_NAME = 'custom_fields'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `work_tasks` ADD COLUMN `custom_fields` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_boards' AND COLUMN_NAME = 'custom_field_defs'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `task_boards` ADD COLUMN `custom_field_defs` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CreateIndex (parent_task_id index may already exist from earlier schema)
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_tasks' AND INDEX_NAME = 'work_tasks_parent_task_id_idx'
);
SET @sqlstmt := IF(
  @exist = 0,
  'CREATE INDEX `work_tasks_parent_task_id_idx` ON `work_tasks`(`parent_task_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CreateTable
CREATE TABLE IF NOT EXISTS `task_attachments` (
    `attachment_id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `storage_key` VARCHAR(191) NOT NULL,
    `uploaded_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_attachments_task_id_created_at_idx`(`task_id`, `created_at`),
    PRIMARY KEY (`attachment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `notification_preferences` (
    `preference_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `digest_mode` VARCHAR(191) NOT NULL DEFAULT 'immediate',
    `categories` JSON NOT NULL DEFAULT (JSON_OBJECT()),
    `updated_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notification_preferences_user_id_key`(`user_id`),
    PRIMARY KEY (`preference_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `roster_assignments` (
    `assignment_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `shift_preset` VARCHAR(191) NOT NULL DEFAULT 'DAY',
    `start_minutes` INTEGER NULL,
    `end_minutes` INTEGER NULL,
    `note` TEXT NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `roster_assignments_work_date_published_idx`(`work_date`, `published`),
    UNIQUE INDEX `roster_assignments_employee_id_work_date_key`(`employee_id`, `work_date`),
    PRIMARY KEY (`assignment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `overtime_claims` (
    `claim_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `minutes` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewed_by_user_id` VARCHAR(191) NULL,
    `review_notes` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `overtime_claims_employee_id_work_date_idx`(`employee_id`, `work_date`),
    INDEX `overtime_claims_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`claim_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `checklist_templates` (
    `template_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `checklist_templates_kind_is_active_idx`(`kind`, `is_active`),
    PRIMARY KEY (`template_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `checklist_template_items` (
    `item_id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `link_path` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `checklist_template_items_template_id_sort_order_idx`(`template_id`, `sort_order`),
    PRIMARY KEY (`item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `checklist_instances` (
    `instance_id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `checklist_instances_employee_id_kind_status_idx`(`employee_id`, `kind`, `status`),
    PRIMARY KEY (`instance_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `checklist_item_states` (
    `state_id` VARCHAR(191) NOT NULL,
    `instance_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `link_path` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `completed_at` DATETIME(3) NULL,

    INDEX `checklist_item_states_instance_id_sort_order_idx`(`instance_id`, `sort_order`),
    PRIMARY KEY (`state_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `company_documents` (
    `document_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'POLICY',
    `body` TEXT NULL,
    `file_name` VARCHAR(191) NULL,
    `mime_type` VARCHAR(191) NULL,
    `storage_key` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `requires_ack` BOOLEAN NOT NULL DEFAULT true,
    `visibility_roles` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `published` BOOLEAN NOT NULL DEFAULT true,
    `uploaded_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `company_documents_published_category_idx`(`published`, `category`),
    PRIMARY KEY (`document_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `document_acks` (
    `ack_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `acknowledged_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `document_acks_employee_id_idx`(`employee_id`),
    UNIQUE INDEX `document_acks_document_id_employee_id_version_key`(`document_id`, `employee_id`, `version`),
    PRIMARY KEY (`ack_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `appraisal_cycles` (
    `cycle_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `appraisal_cycles_status_starts_on_idx`(`status`, `starts_on`),
    PRIMARY KEY (`cycle_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `appraisal_reviews` (
    `review_id` VARCHAR(191) NOT NULL,
    `cycle_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `manager_user_id` VARCHAR(191) NOT NULL,
    `rating` INTEGER NULL,
    `comments` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `appraisal_reviews_manager_user_id_status_idx`(`manager_user_id`, `status`),
    UNIQUE INDEX `appraisal_reviews_cycle_id_employee_id_key`(`cycle_id`, `employee_id`),
    PRIMARY KEY (`review_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `sop_articles` (
    `article_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `audience_roles` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `published` BOOLEAN NOT NULL DEFAULT false,
    `author_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sop_articles_published_updated_at_idx`(`published`, `updated_at`),
    PRIMARY KEY (`article_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `sop_reads` (
    `read_id` VARCHAR(191) NOT NULL,
    `article_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `read_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sop_reads_article_id_employee_id_key`(`article_id`, `employee_id`),
    PRIMARY KEY (`read_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `recruitment_jobs` (
    `job_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `department_name` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `created_by_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `recruitment_jobs_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`job_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `candidates` (
    `candidate_id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `stage` VARCHAR(191) NOT NULL DEFAULT 'APPLIED',
    `notes` TEXT NULL,
    `hired_employee_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `candidates_job_id_stage_idx`(`job_id`, `stage`),
    PRIMARY KEY (`candidate_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey (ignore if already present)
SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_attachments' AND CONSTRAINT_NAME = 'task_attachments_task_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_attachments' AND CONSTRAINT_NAME = 'task_attachments_uploaded_by_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_preferences' AND CONSTRAINT_NAME = 'notification_preferences_user_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roster_assignments' AND CONSTRAINT_NAME = 'roster_assignments_employee_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `roster_assignments` ADD CONSTRAINT `roster_assignments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'overtime_claims' AND CONSTRAINT_NAME = 'overtime_claims_employee_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `overtime_claims` ADD CONSTRAINT `overtime_claims_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'overtime_claims' AND CONSTRAINT_NAME = 'overtime_claims_reviewed_by_user_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `overtime_claims` ADD CONSTRAINT `overtime_claims_reviewed_by_user_id_fkey` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_template_items' AND CONSTRAINT_NAME = 'checklist_template_items_template_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `checklist_template_items` ADD CONSTRAINT `checklist_template_items_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`template_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_instances' AND CONSTRAINT_NAME = 'checklist_instances_template_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `checklist_instances` ADD CONSTRAINT `checklist_instances_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `checklist_templates`(`template_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_instances' AND CONSTRAINT_NAME = 'checklist_instances_employee_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `checklist_instances` ADD CONSTRAINT `checklist_instances_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'checklist_item_states' AND CONSTRAINT_NAME = 'checklist_item_states_instance_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `checklist_item_states` ADD CONSTRAINT `checklist_item_states_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `checklist_instances`(`instance_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_documents' AND CONSTRAINT_NAME = 'company_documents_uploaded_by_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `company_documents` ADD CONSTRAINT `company_documents_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_acks' AND CONSTRAINT_NAME = 'document_acks_document_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `document_acks` ADD CONSTRAINT `document_acks_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `company_documents`(`document_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_acks' AND CONSTRAINT_NAME = 'document_acks_employee_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `document_acks` ADD CONSTRAINT `document_acks_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appraisal_reviews' AND CONSTRAINT_NAME = 'appraisal_reviews_cycle_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `appraisal_reviews` ADD CONSTRAINT `appraisal_reviews_cycle_id_fkey` FOREIGN KEY (`cycle_id`) REFERENCES `appraisal_cycles`(`cycle_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appraisal_reviews' AND CONSTRAINT_NAME = 'appraisal_reviews_employee_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `appraisal_reviews` ADD CONSTRAINT `appraisal_reviews_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appraisal_reviews' AND CONSTRAINT_NAME = 'appraisal_reviews_manager_user_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `appraisal_reviews` ADD CONSTRAINT `appraisal_reviews_manager_user_id_fkey` FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sop_articles' AND CONSTRAINT_NAME = 'sop_articles_author_user_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `sop_articles` ADD CONSTRAINT `sop_articles_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sop_reads' AND CONSTRAINT_NAME = 'sop_reads_article_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `sop_reads` ADD CONSTRAINT `sop_reads_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `sop_articles`(`article_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sop_reads' AND CONSTRAINT_NAME = 'sop_reads_employee_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `sop_reads` ADD CONSTRAINT `sop_reads_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recruitment_jobs' AND CONSTRAINT_NAME = 'recruitment_jobs_created_by_user_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `recruitment_jobs` ADD CONSTRAINT `recruitment_jobs_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'candidates' AND CONSTRAINT_NAME = 'candidates_job_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `candidates` ADD CONSTRAINT `candidates_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `recruitment_jobs`(`job_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'candidates' AND CONSTRAINT_NAME = 'candidates_hired_employee_id_fkey'
);
SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE `candidates` ADD CONSTRAINT `candidates_hired_employee_id_fkey` FOREIGN KEY (`hired_employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed default onboarding/offboarding templates
INSERT IGNORE INTO `checklist_templates` (`template_id`, `name`, `kind`, `is_active`, `created_at`, `updated_at`)
VALUES
  ('tmpl_onboarding_default', 'Default onboarding', 'ONBOARDING', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('tmpl_offboarding_default', 'Default offboarding', 'OFFBOARDING', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO `checklist_template_items` (`item_id`, `template_id`, `title`, `link_path`, `sort_order`) VALUES
  ('tmpl_on_item_1', 'tmpl_onboarding_default', 'Complete My Profile', '/profile', 0),
  ('tmpl_on_item_2', 'tmpl_onboarding_default', 'Register face verification', '/face-enrollment', 1),
  ('tmpl_on_item_3', 'tmpl_onboarding_default', 'View ID card', '/id-card', 2),
  ('tmpl_on_item_4', 'tmpl_onboarding_default', 'Acknowledge company documents', '/documents', 3),
  ('tmpl_off_item_1', 'tmpl_offboarding_default', 'Return assigned assets', '/assets', 0),
  ('tmpl_off_item_2', 'tmpl_offboarding_default', 'Complete exit checklist notes', '/checklists', 1),
  ('tmpl_off_item_3', 'tmpl_offboarding_default', 'Revoke access (HR)', '/users', 2);
