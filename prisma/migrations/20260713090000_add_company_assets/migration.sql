CREATE TABLE `company_assets` (
    `asset_id` VARCHAR(191) NOT NULL,
    `asset_code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `serial_number` VARCHAR(191) NULL,
    `purchase_value` DECIMAL(12, 2) NOT NULL,
    `purchase_date` DATE NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'AVAILABLE',
    `assigned_employee_id` VARCHAR(191) NULL,
    `branch_id` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `notes` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_assets_asset_code_key`(`asset_code`),
    UNIQUE INDEX `company_assets_serial_number_key`(`serial_number`),
    INDEX `company_assets_assigned_employee_id_idx`(`assigned_employee_id`),
    INDEX `company_assets_status_idx`(`status`),
    PRIMARY KEY (`asset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `company_assets` ADD CONSTRAINT `company_assets_assigned_employee_id_fkey`
  FOREIGN KEY (`assigned_employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `company_assets` ADD CONSTRAINT `company_assets_branch_id_fkey`
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE;
