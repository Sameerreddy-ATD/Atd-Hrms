-- Attendance exceptions + Workday classification (additive only)

ALTER TABLE `attendance_workdays`
    ADD COLUMN `attendance_result` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `classification_reason` VARCHAR(500) NULL,
    ADD COLUMN `classification_version` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `classified_at` DATETIME(3) NULL,
    ADD COLUMN `correction_lock_state` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    ADD COLUMN `employee_correction_ends_at` DATETIME(3) NULL;

CREATE INDEX `attendance_workdays_attendance_result_work_date_idx` ON `attendance_workdays`(`attendance_result`, `work_date`);
CREATE INDEX `attendance_workdays_corr_lock_ends_idx` ON `attendance_workdays`(`correction_lock_state`, `employee_correction_ends_at`);

CREATE TABLE `attendance_exceptions` (
    `exception_id` VARCHAR(191) NOT NULL,
    `workday_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `related_session_id` VARCHAR(191) NULL,
    `related_event_id` VARCHAR(191) NULL,
    `dedupe_key` VARCHAR(191) NOT NULL,
    `details` JSON NULL,
    `notification_tag` VARCHAR(120) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attendance_exceptions_dedupe_key_key`(`dedupe_key`),
    UNIQUE INDEX `attendance_exceptions_notification_tag_key`(`notification_tag`),
    INDEX `attendance_exceptions_employee_id_status_detected_at_idx`(`employee_id`, `status`, `detected_at`),
    INDEX `attendance_exceptions_type_status_detected_at_idx`(`type`, `status`, `detected_at`),
    INDEX `attendance_exceptions_workday_id_status_idx`(`workday_id`, `status`),
    PRIMARY KEY (`exception_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `attendance_exceptions`
    ADD CONSTRAINT `attendance_exceptions_workday_id_fkey`
    FOREIGN KEY (`workday_id`) REFERENCES `attendance_workdays`(`workday_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `attendance_exceptions`
    ADD CONSTRAINT `attendance_exceptions_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `attendance_correction_requests`
    ADD COLUMN `workday_id` VARCHAR(191) NULL,
    ADD COLUMN `session_id` VARCHAR(191) NULL,
    ADD COLUMN `correction_type` VARCHAR(40) NULL,
    ADD COLUMN `reviewed_at` DATETIME(3) NULL;

CREATE INDEX `attendance_correction_requests_workday_id_status_idx` ON `attendance_correction_requests`(`workday_id`, `status`);

ALTER TABLE `attendance_correction_requests`
    ADD CONSTRAINT `attendance_correction_requests_workday_id_fkey`
    FOREIGN KEY (`workday_id`) REFERENCES `attendance_workdays`(`workday_id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
