-- Add profile_verified column to employees
ALTER TABLE `employees` ADD COLUMN `profile_verified` BOOLEAN NOT NULL DEFAULT false;

-- Create profile_correction_requests table
CREATE TABLE `profile_correction_requests` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `field` VARCHAR(60) NOT NULL,
    `section` VARCHAR(20) NOT NULL,
    `current_value` TEXT NULL,
    `suggested_value` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `reviewed_by` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `profile_correction_requests_employee_id_status_idx`(`employee_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign key
ALTER TABLE `profile_correction_requests` ADD CONSTRAINT `profile_correction_requests_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
