-- Task Planner Foundation (additive)
-- Evolve Work Planner: work types, reporter, status category, project roles.
-- Does NOT touch Attendance, Leave, Employee Master, Payroll, or Assets.

-- Work item types: preserve existing; add IMPROVEMENT + SUBTASK
ALTER TABLE `work_tasks`
  MODIFY COLUMN `issue_type` ENUM(
    'TASK',
    'BUG',
    'STORY',
    'EPIC',
    'IMPROVEMENT',
    'SUBTASK'
  ) NOT NULL DEFAULT 'TASK';

-- Explicit reporter (distinct from creator). Backfill to creator.
ALTER TABLE `work_tasks`
  ADD COLUMN `reporter_user_id` VARCHAR(191) NULL AFTER `created_by_user_id`;

UPDATE `work_tasks`
SET `reporter_user_id` = `created_by_user_id`
WHERE `reporter_user_id` IS NULL;

ALTER TABLE `work_tasks`
  ADD INDEX `work_tasks_reporter_user_id_idx` (`reporter_user_id`),
  ADD INDEX `work_tasks_issue_type_idx` (`issue_type`);

ALTER TABLE `work_tasks`
  ADD CONSTRAINT `work_tasks_reporter_user_id_fkey`
    FOREIGN KEY (`reporter_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Status category on stages (prep for workflow; not a competing status system)
ALTER TABLE `task_stages`
  ADD COLUMN `status_category` ENUM('TODO', 'IN_PROGRESS', 'DONE') NOT NULL DEFAULT 'TODO'
    AFTER `status`;

UPDATE `task_stages`
SET `status_category` = CASE
  WHEN `is_completed` = true OR `status` IN ('COMPLETED', 'CANCELLED') THEN 'DONE'
  WHEN `status` IN ('IN_PROGRESS', 'BLOCKED', 'REVIEW') THEN 'IN_PROGRESS'
  ELSE 'TODO'
END;

ALTER TABLE `task_stages`
  ADD INDEX `task_stages_board_id_status_category_idx` (`board_id`, `status_category`);

-- Project lead (optional)
ALTER TABLE `task_boards`
  ADD COLUMN `lead_employee_id` VARCHAR(191) NULL AFTER `created_by_user_id`;

ALTER TABLE `task_boards`
  ADD INDEX `task_boards_lead_employee_id_idx` (`lead_employee_id`);

ALTER TABLE `task_boards`
  ADD CONSTRAINT `task_boards_lead_employee_id_fkey`
    FOREIGN KEY (`lead_employee_id`) REFERENCES `employees` (`employee_id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Project member roles (foundation for capabilities)
ALTER TABLE `task_board_members`
  ADD COLUMN `role` ENUM(
    'PROJECT_ADMIN',
    'PROJECT_LEAD',
    'MEMBER',
    'VIEWER'
  ) NOT NULL DEFAULT 'MEMBER';

ALTER TABLE `task_board_members`
  ADD INDEX `task_board_members_board_id_role_idx` (`board_id`, `role`);

-- Promote existing board creators (when they are members) to PROJECT_ADMIN
UPDATE `task_board_members` m
INNER JOIN `task_boards` b ON b.`board_id` = m.`board_id`
INNER JOIN `users` u ON u.`id` = b.`created_by_user_id`
SET m.`role` = 'PROJECT_ADMIN'
WHERE u.`employee_id` IS NOT NULL
  AND u.`employee_id` = m.`employee_id`;

-- Set lead to creator's employee when available
UPDATE `task_boards` b
INNER JOIN `users` u ON u.`id` = b.`created_by_user_id`
SET b.`lead_employee_id` = u.`employee_id`
WHERE b.`lead_employee_id` IS NULL
  AND u.`employee_id` IS NOT NULL;
