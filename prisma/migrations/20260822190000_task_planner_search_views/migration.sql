-- Task Planner: search + saved views (additive)

CREATE TABLE `task_saved_views` (
  `saved_view_id` VARCHAR(191) NOT NULL,
  `owner_user_id` VARCHAR(191) NOT NULL,
  `board_id` VARCHAR(191) NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `scope` ENUM('PERSONAL', 'PROJECT') NOT NULL,
  `filter_config` JSON NOT NULL,
  `sort_config` JSON NOT NULL,
  `column_config` JSON NOT NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT false,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`saved_view_id`),
  INDEX `task_saved_views_owner_user_id_scope_idx`(`owner_user_id`, `scope`),
  INDEX `task_saved_views_board_id_scope_idx`(`board_id`, `scope`),
  INDEX `task_saved_views_owner_user_id_is_default_idx`(`owner_user_id`, `is_default`),
  CONSTRAINT `task_saved_views_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_saved_views_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`board_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Search performance: title prefix scans within board scope
CREATE INDEX `work_tasks_board_id_title_idx` ON `work_tasks`(`board_id`, `title`(64));
