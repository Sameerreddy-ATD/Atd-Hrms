-- Task Workspace v2 intentionally removes all legacy task data as requested before go-live.
-- No employee, attendance, leave, expense, asset, or configuration records are touched.
DELETE FROM `task_updates`;
DELETE FROM `task_assignments`;
UPDATE `work_tasks` SET `parent_task_id` = NULL;
DELETE FROM `work_tasks`;
DELETE FROM `task_board_roles`;
DELETE FROM `task_board_members`;
DELETE FROM `task_stages`;
DELETE FROM `task_boards`;

ALTER TABLE `task_stages`
  ADD COLUMN `status` ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'TODO';

ALTER TABLE `work_tasks`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `archived_at` DATETIME(3) NULL,
  ADD COLUMN `last_activity_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `task_assignments`
  ADD COLUMN `assigned_by_user_id` VARCHAR(191) NULL;

ALTER TABLE `task_updates`
  ADD COLUMN `activity_type` ENUM('CREATED', 'COMMENT', 'STATUS_CHANGED', 'PROGRESS_UPDATED', 'ASSIGNEES_CHANGED', 'DETAILS_UPDATED') NOT NULL DEFAULT 'COMMENT',
  ADD COLUMN `metadata` JSON NULL;

CREATE INDEX `work_tasks_board_id_status_due_date_idx` ON `work_tasks`(`board_id`, `status`, `due_date`);
CREATE INDEX `work_tasks_archived_at_status_idx` ON `work_tasks`(`archived_at`, `status`);
CREATE INDEX `work_tasks_last_activity_at_idx` ON `work_tasks`(`last_activity_at`);
CREATE INDEX `task_assignments_assigned_by_user_id_assigned_at_idx` ON `task_assignments`(`assigned_by_user_id`, `assigned_at`);

ALTER TABLE `task_assignments`
  ADD CONSTRAINT `task_assignments_assigned_by_user_id_fkey`
  FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `work_tasks`
  ADD CONSTRAINT `work_tasks_progress_check` CHECK (`progress` BETWEEN 0 AND 100);

ALTER TABLE `task_updates`
  ADD CONSTRAINT `task_updates_progress_check` CHECK (`progress` IS NULL OR `progress` BETWEEN 0 AND 100),
  ADD CONSTRAINT `task_updates_minutes_check` CHECK (`minutes_worked` IS NULL OR `minutes_worked` BETWEEN 0 AND 1440);
