-- Wave B/C: vehicle asset fields + fix face checklist link paths for existing rows

SET @db := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company_assets' AND COLUMN_NAME = 'vehicle_registration'
);
SET @sqlstmt := IF(@exists = 0,
  'ALTER TABLE `company_assets` ADD COLUMN `vehicle_registration` VARCHAR(64) NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company_assets' AND COLUMN_NAME = 'insurance_expiry'
);
SET @sqlstmt := IF(@exists = 0,
  'ALTER TABLE `company_assets` ADD COLUMN `insurance_expiry` DATE NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'company_assets' AND COLUMN_NAME = 'fitness_expiry'
);
SET @sqlstmt := IF(@exists = 0,
  'ALTER TABLE `company_assets` ADD COLUMN `fitness_expiry` DATE NULL',
  'SELECT 1');
PREPARE stmt FROM @sqlstmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `checklist_template_items`
SET `link_path` = '/face-enrollment'
WHERE `item_id` = 'tmpl_on_item_2' OR (`title` LIKE '%face%' AND `link_path` = '/dashboard');

UPDATE `checklist_item_states`
SET `link_path` = '/face-enrollment'
WHERE `completed` = 0 AND `title` LIKE '%face%' AND (`link_path` = '/dashboard' OR `link_path` IS NULL OR `link_path` = '/face-enrollment');
