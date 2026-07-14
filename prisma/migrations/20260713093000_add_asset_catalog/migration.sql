CREATE TABLE `asset_catalog_items` (
    `catalog_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `default_value` DECIMAL(12, 2) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_catalog_items_name_key`(`name`),
    PRIMARY KEY (`catalog_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `company_assets` ADD COLUMN `catalog_id` VARCHAR(191) NULL;
CREATE INDEX `company_assets_catalog_id_idx` ON `company_assets`(`catalog_id`);
ALTER TABLE `company_assets` ADD CONSTRAINT `company_assets_catalog_id_fkey`
  FOREIGN KEY (`catalog_id`) REFERENCES `asset_catalog_items`(`catalog_id`) ON DELETE SET NULL ON UPDATE CASCADE;
