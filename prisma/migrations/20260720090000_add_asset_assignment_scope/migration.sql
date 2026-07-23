ALTER TABLE `company_assets`
  ADD COLUMN `assignment_scope` ENUM('EMPLOYEE', 'COMPANY') NOT NULL DEFAULT 'EMPLOYEE' AFTER `asset_type`;

CREATE INDEX `company_assets_assignment_scope_status_idx`
  ON `company_assets`(`assignment_scope`, `status`);
