-- Task Planner: collaboration & traceability (additive)

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
    'EPIC_DATES_CHANGED',
    'RELATION_ADDED',
    'RELATION_REMOVED',
    'LABEL_ADDED',
    'LABEL_REMOVED',
    'WORK_LOG_ADDED',
    'WORK_LOG_UPDATED',
    'WORK_LOG_DELETED',
    'PRIORITY_CHANGED',
    'REPORTER_CHANGED',
    'TITLE_CHANGED',
    'DATES_CHANGED'
  ) NOT NULL DEFAULT 'COMMENT';

CREATE TABLE `task_labels` (
  `label_id` VARCHAR(191) NOT NULL,
  `board_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `normalized_name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `color` VARCHAR(32) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`label_id`),
  UNIQUE INDEX `task_labels_board_id_normalized_name_key`(`board_id`, `normalized_name`),
  INDEX `task_labels_board_id_active_idx`(`board_id`, `active`),
  CONSTRAINT `task_labels_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`board_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `work_task_labels` (
  `task_id` VARCHAR(191) NOT NULL,
  `label_id` VARCHAR(191) NOT NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`task_id`, `label_id`),
  INDEX `work_task_labels_label_id_idx`(`label_id`),
  CONSTRAINT `work_task_labels_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `work_task_labels_label_id_fkey` FOREIGN KEY (`label_id`) REFERENCES `task_labels`(`label_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `work_task_relations` (
  `relation_id` VARCHAR(191) NOT NULL,
  `source_task_id` VARCHAR(191) NOT NULL,
  `target_task_id` VARCHAR(191) NOT NULL,
  `relation_type` ENUM('BLOCKS', 'RELATES_TO', 'DUPLICATES') NOT NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`relation_id`),
  UNIQUE INDEX `wtr_src_tgt_type_key`(`source_task_id`, `target_task_id`, `relation_type`),
  INDEX `work_task_relations_source_task_id_relation_type_idx`(`source_task_id`, `relation_type`),
  INDEX `work_task_relations_target_task_id_relation_type_idx`(`target_task_id`, `relation_type`),
  CONSTRAINT `work_task_relations_source_task_id_fkey` FOREIGN KEY (`source_task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `work_task_relations_target_task_id_fkey` FOREIGN KEY (`target_task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `work_task_relations_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `work_item_watchers` (
  `task_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`task_id`, `user_id`),
  INDEX `work_item_watchers_user_id_idx`(`user_id`),
  CONSTRAINT `work_item_watchers_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `work_item_watchers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `work_logs` (
  `work_log_id` VARCHAR(191) NOT NULL,
  `task_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `minutes` INT NOT NULL,
  `work_date` DATE NOT NULL,
  `description` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `updated_by_user_id` VARCHAR(191) NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`work_log_id`),
  INDEX `work_logs_task_id_work_date_idx`(`task_id`, `work_date`),
  INDEX `work_logs_user_id_work_date_idx`(`user_id`, `work_date`),
  INDEX `work_logs_task_id_deleted_at_idx`(`task_id`, `deleted_at`),
  CONSTRAINT `work_logs_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `work_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `work_logs_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `work_logs_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
