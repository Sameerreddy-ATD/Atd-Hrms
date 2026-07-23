ALTER TABLE `employees`
  ADD COLUMN `company_phone` VARCHAR(191) NULL,
  ADD COLUMN `company_entity` ENUM(
    'ROYAL_PETRO_PARK_PRIVATE_LIMITED',
    'ANYTIME_DIESEL',
    'FUELISTIC_INNOVATIONS_PRIVATE_LIMITED'
  ) NOT NULL DEFAULT 'ANYTIME_DIESEL',
  ADD COLUMN `blood_group` VARCHAR(191) NULL,
  ADD COLUMN `bank_account_type` ENUM('SAVINGS', 'CURRENT', 'SALARY', 'NRE', 'NRO', 'OTHER') NULL,
  ADD COLUMN `bank_account_holder_name` VARCHAR(191) NULL,
  ADD COLUMN `bank_ifsc_code` VARCHAR(191) NULL,
  ADD COLUMN `bank_account_number_encrypted` TEXT NULL,
  ADD COLUMN `bank_account_number_last4` VARCHAR(4) NULL,
  ADD COLUMN `pan_number_encrypted` TEXT NULL,
  ADD COLUMN `pan_number_last4` VARCHAR(4) NULL,
  ADD COLUMN `aadhaar_number_encrypted` TEXT NULL,
  ADD COLUMN `aadhaar_number_last4` VARCHAR(4) NULL,
  ADD COLUMN `uan_number_encrypted` TEXT NULL,
  ADD COLUMN `uan_number_last4` VARCHAR(4) NULL;

UPDATE `employees` AS `employee`
LEFT JOIN `emergency_contacts` AS `contact`
  ON `contact`.`employee_id` = `employee`.`employee_id`
SET `employee`.`blood_group` = `contact`.`blood_group`
WHERE `employee`.`blood_group` IS NULL
  AND `contact`.`blood_group` IS NOT NULL;

ALTER TABLE `employees`
  ADD CONSTRAINT `employees_bank_details_check` CHECK (
    (`bank_account_number_encrypted` IS NULL AND `bank_account_number_last4` IS NULL)
    OR (`bank_account_number_encrypted` IS NOT NULL AND CHAR_LENGTH(`bank_account_number_last4`) = 4)
  ),
  ADD CONSTRAINT `employees_pan_check` CHECK (
    (`pan_number_encrypted` IS NULL AND `pan_number_last4` IS NULL)
    OR (`pan_number_encrypted` IS NOT NULL AND CHAR_LENGTH(`pan_number_last4`) = 4)
  ),
  ADD CONSTRAINT `employees_aadhaar_check` CHECK (
    (`aadhaar_number_encrypted` IS NULL AND `aadhaar_number_last4` IS NULL)
    OR (`aadhaar_number_encrypted` IS NOT NULL AND CHAR_LENGTH(`aadhaar_number_last4`) = 4)
  ),
  ADD CONSTRAINT `employees_uan_check` CHECK (
    (`uan_number_encrypted` IS NULL AND `uan_number_last4` IS NULL)
    OR (`uan_number_encrypted` IS NOT NULL AND CHAR_LENGTH(`uan_number_last4`) = 4)
  );
