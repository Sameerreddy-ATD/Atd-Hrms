CREATE TABLE `task_assignments` (
  `assignment_id` VARCHAR(191) NOT NULL,
  `task_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `task_assignments_task_id_employee_id_key`(`task_id`, `employee_id`),
  INDEX `task_assignments_employee_id_task_id_idx`(`employee_id`, `task_id`),
  PRIMARY KEY (`assignment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `task_assignments` (`assignment_id`, `task_id`, `employee_id`, `assigned_at`)
SELECT UUID(), `task_id`, `assignee_employee_id`, `created_at` FROM `work_tasks`;

ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `work_tasks` DROP FOREIGN KEY `work_tasks_assignee_employee_id_fkey`;
ALTER TABLE `work_tasks` DROP INDEX `work_tasks_assignee_employee_id_status_idx`;
ALTER TABLE `work_tasks` DROP COLUMN `assignee_employee_id`;
CREATE INDEX `work_tasks_status_idx` ON `work_tasks`(`status`);
