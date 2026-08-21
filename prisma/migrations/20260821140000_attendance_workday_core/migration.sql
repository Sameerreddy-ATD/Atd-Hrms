-- Attendance Workday Core (additive only)

CREATE TABLE `attendance_workdays` (
    `workday_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `work_date` DATE NOT NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    `schedule_source` VARCHAR(20) NOT NULL,
    `explicit_no_shift` BOOLEAN NOT NULL DEFAULT false,
    `shift_template_id` VARCHAR(191) NULL,
    `shift_code_snapshot` VARCHAR(40) NULL,
    `shift_name_snapshot` VARCHAR(120) NULL,
    `expected_work_minutes` INTEGER NULL,
    `scheduled_start_at` DATETIME(3) NULL,
    `scheduled_end_at` DATETIME(3) NULL,
    `schedule_snapshot` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `actual_worked_minutes` INTEGER NOT NULL DEFAULT 0,
    `first_punch_at` DATETIME(3) NULL,
    `last_punch_at` DATETIME(3) NULL,
    `open_session_id` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attendance_workdays_open_session_id_key`(`open_session_id`),
    UNIQUE INDEX `attendance_workdays_employee_id_work_date_key`(`employee_id`, `work_date`),
    INDEX `attendance_workdays_employee_id_status_idx`(`employee_id`, `status`),
    INDEX `attendance_workdays_work_date_status_idx`(`work_date`, `status`),
    PRIMARY KEY (`workday_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attendance_sessions` (
    `session_id` VARCHAR(191) NOT NULL,
    `workday_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 1,
    `check_in_event_id` VARCHAR(191) NULL,
    `check_out_event_id` VARCHAR(191) NULL,
    `check_in_at` DATETIME(3) NOT NULL,
    `check_out_at` DATETIME(3) NULL,
    `check_in_location_id` VARCHAR(191) NULL,
    `check_out_location_id` VARCHAR(191) NULL,
    `check_in_location_mode` VARCHAR(30) NOT NULL DEFAULT 'MOBILE_FIELD',
    `check_out_location_mode` VARCHAR(30) NULL,
    `worked_minutes` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attendance_sessions_check_in_event_id_key`(`check_in_event_id`),
    UNIQUE INDEX `attendance_sessions_check_out_event_id_key`(`check_out_event_id`),
    UNIQUE INDEX `attendance_sessions_workday_id_sequence_key`(`workday_id`, `sequence`),
    INDEX `attendance_sessions_employee_id_status_idx`(`employee_id`, `status`),
    INDEX `attendance_sessions_workday_id_status_idx`(`workday_id`, `status`),
    INDEX `attendance_sessions_check_in_at_idx`(`check_in_at`),
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `attendance_events`
  ADD COLUMN `workday_id` VARCHAR(191) NULL,
  ADD COLUMN `session_id` VARCHAR(191) NULL,
  ADD COLUMN `client_event_id` VARCHAR(120) NULL;

CREATE INDEX `attendance_events_workday_id_event_time_idx` ON `attendance_events`(`workday_id`, `event_time`);
CREATE INDEX `attendance_events_session_id_idx` ON `attendance_events`(`session_id`);
CREATE UNIQUE INDEX `attendance_events_employee_id_client_event_id_key` ON `attendance_events`(`employee_id`, `client_event_id`);

ALTER TABLE `attendance_workdays`
  ADD CONSTRAINT `attendance_workdays_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `attendance_workdays_shift_template_id_fkey`
    FOREIGN KEY (`shift_template_id`) REFERENCES `shift_definitions`(`shift_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `attendance_sessions`
  ADD CONSTRAINT `attendance_sessions_workday_id_fkey`
    FOREIGN KEY (`workday_id`) REFERENCES `attendance_workdays`(`workday_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `attendance_sessions_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `attendance_events`
  ADD CONSTRAINT `attendance_events_workday_id_fkey`
    FOREIGN KEY (`workday_id`) REFERENCES `attendance_workdays`(`workday_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `attendance_events_session_id_fkey`
    FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`session_id`) ON DELETE SET NULL ON UPDATE CASCADE;
