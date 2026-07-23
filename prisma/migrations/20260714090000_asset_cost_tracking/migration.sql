ALTER TABLE `company_assets`
  ADD COLUMN `asset_type` ENUM('PHYSICAL', 'ONLINE') NOT NULL DEFAULT 'PHYSICAL',
  ADD COLUMN `cost_frequency` ENUM('ONE_TIME', 'MONTHLY', 'YEARLY') NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN `renewal_date` DATE NULL;

CREATE INDEX `company_assets_asset_type_cost_frequency_idx`
  ON `company_assets`(`asset_type`, `cost_frequency`);
