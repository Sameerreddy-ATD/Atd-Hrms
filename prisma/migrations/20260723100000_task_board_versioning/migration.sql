-- Optimistic concurrency prevents two administrators from silently overwriting
-- board workflow or access configuration at the same time.
ALTER TABLE `task_boards`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT `task_boards_version_check` CHECK (`version` >= 1);
