-- Task Planner: project components + epic roadmap support (additive)

ALTER TABLE `task_updates`
  MODIFY `activity_type` ENUM(
    'CREATED',
    'COMMENT',
    'STATUS_CHANGED',
    'PROGRESS_UPDATED',
    'ASSIGNEES_CHANGED',
    'DETAILS_UPDATED',
    'SPRINT_MEMBERSHIP_CHANGED',
    'EPIC_CHILD_ADDED',
    'EPIC_CHILD_REMOVED',
    'COMPONENT_ASSIGNED',
    'COMPONENT_REMOVED',
    'EPIC_DATES_CHANGED'
  ) NOT NULL DEFAULT 'COMMENT';

CREATE TABLE `task_components` (
  `component_id` VARCHAR(191) NOT NULL,
  `board_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `lead_employee_id` VARCHAR(191) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`component_id`),
  UNIQUE INDEX `task_components_board_id_name_key`(`board_id`, `name`),
  INDEX `task_components_board_id_active_sort_order_idx`(`board_id`, `active`, `sort_order`),
  CONSTRAINT `task_components_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`board_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_components_lead_employee_id_fkey` FOREIGN KEY (`lead_employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `work_task_components` (
  `task_id` VARCHAR(191) NOT NULL,
  `component_id` VARCHAR(191) NOT NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`task_id`, `component_id`),
  INDEX `work_task_components_component_id_idx`(`component_id`),
  CONSTRAINT `work_task_components_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `work_task_components_component_id_fkey` FOREIGN KEY (`component_id`) REFERENCES `task_components`(`component_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
