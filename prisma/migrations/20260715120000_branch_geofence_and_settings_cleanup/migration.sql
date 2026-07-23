ALTER TABLE `branches`
  ADD COLUMN `latitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `longitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `attendance_radius_meters` INTEGER NOT NULL DEFAULT 250;

UPDATE `branches`
SET `latitude` = 17.4391592,
    `longitude` = 78.3947783,
    `attendance_radius_meters` = 250
WHERE UPPER(`branch_code`) IN ('MADHAPUR', 'MDH');

DELETE FROM `system_settings` WHERE `key` = 'PREDEFINED_PASSWORD_HASH';
