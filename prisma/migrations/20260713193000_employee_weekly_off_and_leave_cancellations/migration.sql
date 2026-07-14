ALTER TABLE `employees`
  ADD COLUMN `weekly_off_days` JSON NULL;

ALTER TABLE `leave_requests`
  ADD COLUMN `cancelled_dates` JSON NULL;
