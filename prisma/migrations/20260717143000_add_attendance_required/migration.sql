ALTER TABLE `employees`
  ADD COLUMN `attendance_required` BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE `employees` AS employee
INNER JOIN `users` AS user ON user.`employee_id` = employee.`employee_id`
SET employee.`attendance_required` = FALSE
WHERE user.`role` = 'CEO';
