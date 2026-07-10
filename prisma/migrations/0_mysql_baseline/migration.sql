-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('DEVELOPER_ADMIN', 'MAIN_ADMIN', 'CEO', 'HR', 'MANAGER', 'EMPLOYEE', 'SALES', 'DRIVER', 'FIELD_STAFF') NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `first_login_password_change_required` BOOLEAN NOT NULL DEFAULT true,
    `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
    `last_login_at` DATETIME(3) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `suspended_until` DATETIME(3) NULL,
    `suspension_starts_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_employee_id_key`(`employee_id`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employees` (
    `employee_id` VARCHAR(191) NOT NULL,
    `employee_code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `department_id` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `home_branch_id` VARCHAR(191) NULL,
    `manager_id` VARCHAR(191) NULL,
    `joining_date` DATE NULL,
    `date_of_birth` DATE NULL,
    `gender` ENUM('FEMALE', 'MALE', 'PREFER_NOT_TO_SAY') NULL,
    `employment_type` ENUM('FULL_TIME', 'PART_TIME', 'INTERN') NULL,
    `attendance_mode` ENUM('THUMB_ONLY', 'MOBILE_GPS_ONLY', 'BOTH') NOT NULL DEFAULT 'BOTH',
    `is_field_employee` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employees_employee_code_key`(`employee_code`),
    UNIQUE INDEX `employees_email_key`(`email`),
    PRIMARY KEY (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `department_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `head_employee_id` VARCHAR(191) NULL,

    UNIQUE INDEX `departments_name_key`(`name`),
    PRIMARY KEY (`department_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `branch_id` VARCHAR(191) NOT NULL,
    `branch_name` VARCHAR(191) NOT NULL,
    `branch_code` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `branches_branch_code_key`(`branch_code`),
    PRIMARY KEY (`branch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `holiday_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `holidays_date_idx`(`date`),
    PRIMARY KEY (`holiday_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `biometric_devices` (
    `device_id` VARCHAR(191) NOT NULL,
    `device_name` VARCHAR(191) NOT NULL,
    `device_code` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `device_ip` VARCHAR(191) NULL,
    `port` INTEGER NULL,
    `location` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `last_sync_time` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `biometric_devices_device_code_key`(`device_code`),
    PRIMARY KEY (`device_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `biometric_employee_mapping` (
    `mapping_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `biometric_user_id` VARCHAR(191) NOT NULL,
    `device_id` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`mapping_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_branch_schedule` (
    `schedule_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `scheduled_branch_id` VARCHAR(191) NULL,
    `work_type` ENUM('BRANCH', 'FIELD', 'CLIENT_VISIT', 'WORK_FROM_HOME', 'LEAVE', 'HOLIDAY') NOT NULL,
    `assigned_by` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `employee_branch_schedule_employee_id_date_key`(`employee_id`, `date`),
    PRIMARY KEY (`schedule_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_events` (
    `event_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `event_date` DATE NOT NULL,
    `event_time` DATETIME(3) NOT NULL,
    `event_source` ENUM('THUMB_SCANNER', 'MOBILE_GPS', 'MANUAL_CORRECTION', 'LEAVE', 'HOLIDAY', 'SYSTEM') NOT NULL,
    `event_type` ENUM('OFFICE_IN', 'OFFICE_OUT', 'BRANCH_IN', 'BRANCH_OUT', 'FIELD_CHECK_IN', 'FIELD_CHECK_OUT', 'CLIENT_CHECK_IN', 'CLIENT_CHECK_OUT', 'BREAK_OUT', 'BREAK_IN', 'MANUAL_ADJUSTMENT', 'LEAVE_MARK', 'HOLIDAY_MARK') NOT NULL,
    `branch_id` VARCHAR(191) NULL,
    `device_id` VARCHAR(191) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `address` VARCHAR(191) NULL,
    `client_name` VARCHAR(191) NULL,
    `client_location_name` VARCHAR(191) NULL,
    `work_type` ENUM('BRANCH', 'FIELD', 'CLIENT_VISIT', 'WORK_FROM_HOME', 'LEAVE', 'HOLIDAY') NULL,
    `mobile_device_id` VARCHAR(191) NULL,
    `photo_url` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `raw_payload` JSON NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_events_employee_id_event_date_event_time_idx`(`employee_id`, `event_date`, `event_time`),
    PRIMARY KEY (`event_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_daily_summary` (
    `attendance_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `first_check_in` DATETIME(3) NULL,
    `last_check_out` DATETIME(3) NULL,
    `total_hours` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `office_hours` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `field_hours` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `client_visit_hours` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `attendance_source_summary` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `home_branch_id` VARCHAR(191) NULL,
    `scheduled_branch_id` VARCHAR(191) NULL,
    `primary_attended_branch_id` VARCHAR(191) NULL,
    `actual_attended_branch_ids` JSON NOT NULL,
    `visited_branch_ids` JSON NOT NULL,
    `visited_locations` JSON NOT NULL,
    `branch_movement_count` INTEGER NOT NULL DEFAULT 0,
    `field_visit_count` INTEGER NOT NULL DEFAULT 0,
    `client_visit_count` INTEGER NOT NULL DEFAULT 0,
    `field_check_in_latitude` DECIMAL(10, 7) NULL,
    `field_check_in_longitude` DECIMAL(10, 7) NULL,
    `field_check_out_latitude` DECIMAL(10, 7) NULL,
    `field_check_out_longitude` DECIMAL(10, 7) NULL,
    `is_branch_mismatch` BOOLEAN NOT NULL DEFAULT false,
    `is_location_flagged` BOOLEAN NOT NULL DEFAULT false,
    `has_office_and_field` BOOLEAN NOT NULL DEFAULT false,
    `has_missing_out_event` BOOLEAN NOT NULL DEFAULT false,
    `has_missed_checkout` BOOLEAN NOT NULL DEFAULT false,
    `approval_status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attendance_daily_summary_employee_id_date_key`(`employee_id`, `date`),
    PRIMARY KEY (`attendance_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `field_attendance` (
    `field_attendance_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `check_in_time` DATETIME(3) NOT NULL,
    `check_in_latitude` DECIMAL(10, 7) NOT NULL,
    `check_in_longitude` DECIMAL(10, 7) NOT NULL,
    `check_in_address` VARCHAR(191) NULL,
    `check_out_time` DATETIME(3) NULL,
    `check_out_latitude` DECIMAL(10, 7) NULL,
    `check_out_longitude` DECIMAL(10, 7) NULL,
    `check_out_address` VARCHAR(191) NULL,
    `work_type` ENUM('BRANCH', 'FIELD', 'CLIENT_VISIT', 'WORK_FROM_HOME', 'LEAVE', 'HOLIDAY') NOT NULL,
    `client_name` VARCHAR(191) NULL,
    `client_location_name` VARCHAR(191) NULL,
    `vehicle_number` VARCHAR(191) NULL,
    `task_id` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `selfie_url` VARCHAR(191) NULL,
    `approval_status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    `manager_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`field_attendance_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_types` (
    `leave_type_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `paid` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `leave_types_name_key`(`name`),
    PRIMARY KEY (`leave_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_balances` (
    `leave_balance_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `leave_type_id` VARCHAR(191) NOT NULL,
    `entitled` DECIMAL(8, 2) NOT NULL,
    `used` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(8, 2) NOT NULL,

    UNIQUE INDEX `leave_balances_employee_id_leave_type_id_key`(`employee_id`, `leave_type_id`),
    PRIMARY KEY (`leave_balance_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `leave_request_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `leave_type_id` VARCHAR(191) NOT NULL,
    `from_date` DATE NOT NULL,
    `to_date` DATE NOT NULL,
    `days` DECIMAL(8, 2) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'MANAGER_APPROVED', 'HR_VERIFIED', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `manager_id` VARCHAR(191) NULL,
    `hr_verified_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`leave_request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profile_edit_requests` (
    `request_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `requested_data` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emergency_contacts` (
    `employee_id` VARCHAR(191) NOT NULL,
    `contact_name` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `alternate_phone` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `blood_group` VARCHAR(191) NULL,
    `medical_notes` VARCHAR(191) NULL,

    PRIMARY KEY (`employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `audit_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `performed_by_user_id` VARCHAR(191) NULL,
    `affected_user_id` VARCHAR(191) NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `ip_address` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`audit_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_correction_requests` (
    `request_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `punch_time` DATETIME(3) NOT NULL,
    `event_type` ENUM('OFFICE_IN', 'OFFICE_OUT', 'BRANCH_IN', 'BRANCH_OUT', 'FIELD_CHECK_IN', 'FIELD_CHECK_OUT', 'CLIENT_CHECK_IN', 'CLIENT_CHECK_OUT', 'BREAK_OUT', 'BREAK_IN', 'MANUAL_ADJUSTMENT', 'LEAVE_MARK', 'HOLIDAY_MARK') NOT NULL,
    `remarks` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`department_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_home_branch_id_fkey` FOREIGN KEY (`home_branch_id`) REFERENCES `branches`(`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_head_employee_id_fkey` FOREIGN KEY (`head_employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `holidays_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `biometric_devices` ADD CONSTRAINT `biometric_devices_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`branch_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `biometric_employee_mapping` ADD CONSTRAINT `biometric_employee_mapping_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `biometric_employee_mapping` ADD CONSTRAINT `biometric_employee_mapping_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `biometric_devices`(`device_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_branch_schedule` ADD CONSTRAINT `employee_branch_schedule_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_branch_schedule` ADD CONSTRAINT `employee_branch_schedule_scheduled_branch_id_fkey` FOREIGN KEY (`scheduled_branch_id`) REFERENCES `branches`(`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_events` ADD CONSTRAINT `attendance_events_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_events` ADD CONSTRAINT `attendance_events_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_events` ADD CONSTRAINT `attendance_events_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `biometric_devices`(`device_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_daily_summary` ADD CONSTRAINT `attendance_daily_summary_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `field_attendance` ADD CONSTRAINT `field_attendance_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balances` ADD CONSTRAINT `leave_balances_leave_type_id_fkey` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`leave_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_leave_type_id_fkey` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`leave_type_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emergency_contacts` ADD CONSTRAINT `emergency_contacts_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_performed_by_user_id_fkey` FOREIGN KEY (`performed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_affected_user_id_fkey` FOREIGN KEY (`affected_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_correction_requests` ADD CONSTRAINT `attendance_correction_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;
