CREATE TABLE `work_tasks` (
  `task_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `assignee_employee_id` VARCHAR(191) NOT NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `parent_task_id` VARCHAR(191) NULL,
  `status` ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'TODO',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `progress` INTEGER NOT NULL DEFAULT 0,
  `start_date` DATE NULL,
  `due_date` DATE NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `work_tasks_assignee_employee_id_status_idx`(`assignee_employee_id`, `status`),
  INDEX `work_tasks_created_by_user_id_idx`(`created_by_user_id`),
  INDEX `work_tasks_due_date_idx`(`due_date`),
  INDEX `work_tasks_parent_task_id_idx`(`parent_task_id`),
  PRIMARY KEY (`task_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_updates` (
  `update_id` VARCHAR(191) NOT NULL,
  `task_id` VARCHAR(191) NOT NULL,
  `author_user_id` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `progress` INTEGER NULL,
  `status` ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'COMPLETED', 'CANCELLED') NULL,
  `minutes_worked` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `task_updates_task_id_created_at_idx`(`task_id`, `created_at`),
  INDEX `task_updates_author_user_id_created_at_idx`(`author_user_id`, `created_at`),
  PRIMARY KEY (`update_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `work_tasks` ADD CONSTRAINT `work_tasks_assignee_employee_id_fkey` FOREIGN KEY (`assignee_employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `work_tasks` ADD CONSTRAINT `work_tasks_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `work_tasks` ADD CONSTRAINT `work_tasks_parent_task_id_fkey` FOREIGN KEY (`parent_task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `task_updates` ADD CONSTRAINT `task_updates_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `task_updates` ADD CONSTRAINT `task_updates_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
