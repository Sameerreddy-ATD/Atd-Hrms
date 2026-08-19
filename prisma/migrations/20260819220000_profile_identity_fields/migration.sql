-- Profile verification: personal email, marital status, spouse name, structured addresses
ALTER TABLE `employees` ADD COLUMN `personal_email` VARCHAR(191) NULL;
ALTER TABLE `employees` ADD COLUMN `marital_status` ENUM('SINGLE', 'MARRIED') NULL;
ALTER TABLE `employees` ADD COLUMN `husband_name` VARCHAR(160) NULL;
ALTER TABLE `employees` ADD COLUMN `present_door_no` VARCHAR(80) NULL;
ALTER TABLE `employees` ADD COLUMN `present_flat_name` VARCHAR(120) NULL;
ALTER TABLE `employees` ADD COLUMN `present_street_name` VARCHAR(160) NULL;
ALTER TABLE `employees` ADD COLUMN `permanent_door_no` VARCHAR(80) NULL;
ALTER TABLE `employees` ADD COLUMN `permanent_flat_name` VARCHAR(120) NULL;
ALTER TABLE `employees` ADD COLUMN `permanent_street_name` VARCHAR(160) NULL;
ALTER TABLE `employees` ADD COLUMN `permanent_same_as_present` BOOLEAN NOT NULL DEFAULT false;
