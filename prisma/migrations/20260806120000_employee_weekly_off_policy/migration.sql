-- Employee week-off policy: fixed Sunday vs selectable day with approval.
ALTER TABLE `employees`
  ADD COLUMN `weekly_off_policy` ENUM('SUNDAY_FIXED', 'SELECTABLE') NOT NULL DEFAULT 'SELECTABLE'
  AFTER `is_field_employee`;
