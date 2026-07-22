CREATE TABLE `task_boards` (
  `board_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `access_type` ENUM('OPEN', 'ROLE_GATED', 'MEMBER_GATED') NOT NULL DEFAULT 'OPEN',
  `archived` BOOLEAN NOT NULL DEFAULT false,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`board_id`),
  INDEX `task_boards_archived_updated_at_idx` (`archived`, `updated_at`),
  CONSTRAINT `task_boards_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_stages` (
  `stage_id` VARCHAR(191) NOT NULL,
  `board_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `color` VARCHAR(191) NOT NULL DEFAULT 'SLATE',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_completed` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`stage_id`),
  UNIQUE INDEX `task_stages_board_id_name_key` (`board_id`, `name`),
  INDEX `task_stages_board_id_sort_order_idx` (`board_id`, `sort_order`),
  CONSTRAINT `task_stages_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards` (`board_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_board_roles` (
  `board_id` VARCHAR(191) NOT NULL,
  `role` ENUM('DEVELOPER_ADMIN','MAIN_ADMIN','CEO','HR','MANAGER','EMPLOYEE','SALES','DRIVER','FIELD_STAFF') NOT NULL,
  PRIMARY KEY (`board_id`, `role`),
  CONSTRAINT `task_board_roles_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards` (`board_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `task_board_members` (
  `board_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`board_id`, `employee_id`),
  INDEX `task_board_members_employee_id_idx` (`employee_id`),
  CONSTRAINT `task_board_members_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards` (`board_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_board_members_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `work_tasks`
  ADD COLUMN `board_id` VARCHAR(191) NULL,
  ADD COLUMN `stage_id` VARCHAR(191) NULL,
  ADD INDEX `work_tasks_board_id_stage_id_idx` (`board_id`, `stage_id`),
  ADD CONSTRAINT `work_tasks_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards` (`board_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `work_tasks_stage_id_fkey` FOREIGN KEY (`stage_id`) REFERENCES `task_stages` (`stage_id`) ON DELETE SET NULL ON UPDATE CASCADE;
