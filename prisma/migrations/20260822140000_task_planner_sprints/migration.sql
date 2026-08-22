-- Task Planner: Sprint and backlog planning (additive)

ALTER TABLE `work_tasks`
  ADD COLUMN `backlog_rank` DOUBLE NOT NULL DEFAULT 0 AFTER `rank`;

CREATE INDEX `work_tasks_board_id_backlog_rank_idx` ON `work_tasks`(`board_id`, `backlog_rank`);

ALTER TABLE `task_updates`
  MODIFY `activity_type` ENUM(
    'CREATED',
    'COMMENT',
    'STATUS_CHANGED',
    'PROGRESS_UPDATED',
    'ASSIGNEES_CHANGED',
    'DETAILS_UPDATED',
    'SPRINT_MEMBERSHIP_CHANGED'
  ) NOT NULL DEFAULT 'COMMENT';

CREATE TABLE `task_sprints` (
  `sprint_id` VARCHAR(191) NOT NULL,
  `board_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `goal` TEXT NULL,
  `status` ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`sprint_id`),
  INDEX `task_sprints_board_id_status_idx`(`board_id`, `status`),
  INDEX `task_sprints_board_id_created_at_idx`(`board_id`, `created_at`),
  CONSTRAINT `task_sprints_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`board_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_sprints_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `task_sprint_memberships` (
  `membership_id` VARCHAR(191) NOT NULL,
  `sprint_id` VARCHAR(191) NOT NULL,
  `task_id` VARCHAR(191) NOT NULL,
  `sprint_rank` DOUBLE NOT NULL DEFAULT 0,
  `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `removed_at` DATETIME(3) NULL,
  `added_by_user_id` VARCHAR(191) NOT NULL,
  `removed_by_user_id` VARCHAR(191) NULL,
  `completed_in_sprint` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`membership_id`),
  INDEX `task_sprint_memberships_sprint_id_removed_at_sprint_rank_idx`(`sprint_id`, `removed_at`, `sprint_rank`),
  INDEX `task_sprint_memberships_task_id_removed_at_idx`(`task_id`, `removed_at`),
  CONSTRAINT `task_sprint_memberships_sprint_id_fkey` FOREIGN KEY (`sprint_id`) REFERENCES `task_sprints`(`sprint_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_sprint_memberships_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_sprint_memberships_added_by_user_id_fkey` FOREIGN KEY (`added_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `task_sprint_memberships_removed_by_user_id_fkey` FOREIGN KEY (`removed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `task_sprint_events` (
  `event_id` VARCHAR(191) NOT NULL,
  `sprint_id` VARCHAR(191) NOT NULL,
  `board_id` VARCHAR(191) NOT NULL,
  `event_type` ENUM('SPRINT_CREATED', 'SPRINT_STARTED', 'SPRINT_COMPLETED', 'SPRINT_CANCELLED') NOT NULL,
  `actor_user_id` VARCHAR(191) NOT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`event_id`),
  INDEX `task_sprint_events_sprint_id_created_at_idx`(`sprint_id`, `created_at`),
  INDEX `task_sprint_events_board_id_created_at_idx`(`board_id`, `created_at`),
  CONSTRAINT `task_sprint_events_sprint_id_fkey` FOREIGN KEY (`sprint_id`) REFERENCES `task_sprints`(`sprint_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_sprint_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE `work_tasks` SET `backlog_rank` = `rank` WHERE `backlog_rank` = 0;
