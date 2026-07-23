CREATE TABLE `attendance_reminders` (
  `reminder_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `event_id` VARCHAR(191) NOT NULL,
  `event_date` DATE NOT NULL,
  `event_time` DATETIME(3) NOT NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `attendance_reminders_event_id_key` (`event_id`),
  INDEX `attendance_reminders_employee_id_resolved_at_created_at_idx` (`employee_id`, `resolved_at`, `created_at`),
  PRIMARY KEY (`reminder_id`),
  CONSTRAINT `attendance_reminders_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
