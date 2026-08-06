-- Optional laptop inventory fields for employee-assigned laptops.
ALTER TABLE `company_assets`
  ADD COLUMN `laptop_name` VARCHAR(191) NULL,
  ADD COLUMN `device_id` VARCHAR(191) NULL,
  ADD COLUMN `product_id` VARCHAR(191) NULL,
  ADD COLUMN `processor` VARCHAR(191) NULL,
  ADD COLUMN `ram` VARCHAR(191) NULL,
  ADD COLUMN `ssd` VARCHAR(191) NULL,
  ADD COLUMN `windows_version` VARCHAR(191) NULL,
  ADD COLUMN `mac_address` VARCHAR(191) NULL,
  ADD COLUMN `user_password_encrypted` TEXT NULL,
  ADD COLUMN `admin_password_encrypted` TEXT NULL,
  ADD COLUMN `warranty_until` DATE NULL;
