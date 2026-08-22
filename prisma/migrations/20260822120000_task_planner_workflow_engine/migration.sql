-- Task Planner Workflow Engine (additive).
-- Preserves TaskStage / WorkTask / issue keys / ranks / comments / attachments.

-- CreateTable
CREATE TABLE `task_workflows` (
    `workflow_id` VARCHAR(191) NOT NULL,
    `board_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `kind` ENUM('STANDARD', 'BUG', 'SUBTASK', 'EPIC') NOT NULL DEFAULT 'STANDARD',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_workflows_board_id_kind_idx`(`board_id`, `kind`),
    INDEX `task_workflows_board_id_is_default_idx`(`board_id`, `is_default`),
    PRIMARY KEY (`workflow_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_workflow_type_mappings` (
    `board_id` VARCHAR(191) NOT NULL,
    `issue_type` ENUM('TASK', 'BUG', 'STORY', 'EPIC', 'IMPROVEMENT', 'SUBTASK') NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,

    INDEX `task_workflow_type_mappings_workflow_id_idx`(`workflow_id`),
    PRIMARY KEY (`board_id`, `issue_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_workflow_statuses` (
    `status_id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('TODO', 'IN_PROGRESS', 'DONE') NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `color` VARCHAR(191) NOT NULL DEFAULT 'SLATE',
    `is_initial` BOOLEAN NOT NULL DEFAULT false,
    `is_terminal` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `stage_id` VARCHAR(191) NULL,

    INDEX `task_workflow_statuses_workflow_id_sort_order_idx`(`workflow_id`, `sort_order`),
    INDEX `task_workflow_statuses_workflow_id_active_idx`(`workflow_id`, `active`),
    INDEX `task_workflow_statuses_stage_id_idx`(`stage_id`),
    PRIMARY KEY (`status_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_workflow_transitions` (
    `transition_id` VARCHAR(191) NOT NULL,
    `workflow_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `from_status_id` VARCHAR(191) NOT NULL,
    `to_status_id` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `allowed_project_roles` JSON NULL,
    `required_fields` JSON NULL,
    `comment_required` BOOLEAN NOT NULL DEFAULT false,
    `resolution_required` BOOLEAN NOT NULL DEFAULT false,
    `validator_config` JSON NULL,

    INDEX `task_workflow_transitions_workflow_id_from_status_id_active_idx`(`workflow_id`, `from_status_id`, `active`),
    INDEX `task_workflow_transitions_from_status_id_idx`(`from_status_id`),
    INDEX `task_workflow_transitions_to_status_id_idx`(`to_status_id`),
    PRIMARY KEY (`transition_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_transition_history` (
    `history_id` VARCHAR(191) NOT NULL,
    `task_id` VARCHAR(191) NOT NULL,
    `from_status_id` VARCHAR(191) NULL,
    `to_status_id` VARCHAR(191) NULL,
    `from_status_name` VARCHAR(191) NOT NULL,
    `to_status_name` VARCHAR(191) NOT NULL,
    `transition_id` VARCHAR(191) NULL,
    `transition_name` VARCHAR(191) NOT NULL,
    `actor_user_id` VARCHAR(191) NOT NULL,
    `comment` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_transition_history_task_id_created_at_idx`(`task_id`, `created_at`),
    INDEX `task_transition_history_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `task_transition_history_transition_id_idx`(`transition_id`),
    PRIMARY KEY (`history_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `work_tasks`
    ADD COLUMN `workflow_status_id` VARCHAR(191) NULL,
    ADD COLUMN `resolution` VARCHAR(120) NULL;

CREATE INDEX `work_tasks_workflow_status_id_idx` ON `work_tasks`(`workflow_status_id`);

-- AddForeignKey
ALTER TABLE `task_workflows`
    ADD CONSTRAINT `task_workflows_board_id_fkey`
    FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`board_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_workflow_type_mappings`
    ADD CONSTRAINT `task_workflow_type_mappings_workflow_id_fkey`
    FOREIGN KEY (`workflow_id`) REFERENCES `task_workflows`(`workflow_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_workflow_type_mappings`
    ADD CONSTRAINT `task_workflow_type_mappings_board_id_fkey`
    FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`board_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_workflow_statuses`
    ADD CONSTRAINT `task_workflow_statuses_workflow_id_fkey`
    FOREIGN KEY (`workflow_id`) REFERENCES `task_workflows`(`workflow_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_workflow_statuses`
    ADD CONSTRAINT `task_workflow_statuses_stage_id_fkey`
    FOREIGN KEY (`stage_id`) REFERENCES `task_stages`(`stage_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `task_workflow_transitions`
    ADD CONSTRAINT `task_workflow_transitions_workflow_id_fkey`
    FOREIGN KEY (`workflow_id`) REFERENCES `task_workflows`(`workflow_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_workflow_transitions`
    ADD CONSTRAINT `task_workflow_transitions_from_status_id_fkey`
    FOREIGN KEY (`from_status_id`) REFERENCES `task_workflow_statuses`(`status_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `task_workflow_transitions`
    ADD CONSTRAINT `task_workflow_transitions_to_status_id_fkey`
    FOREIGN KEY (`to_status_id`) REFERENCES `task_workflow_statuses`(`status_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `task_transition_history`
    ADD CONSTRAINT `task_transition_history_task_id_fkey`
    FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`task_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `task_transition_history`
    ADD CONSTRAINT `task_transition_history_from_status_id_fkey`
    FOREIGN KEY (`from_status_id`) REFERENCES `task_workflow_statuses`(`status_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `task_transition_history`
    ADD CONSTRAINT `task_transition_history_to_status_id_fkey`
    FOREIGN KEY (`to_status_id`) REFERENCES `task_workflow_statuses`(`status_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `task_transition_history`
    ADD CONSTRAINT `task_transition_history_transition_id_fkey`
    FOREIGN KEY (`transition_id`) REFERENCES `task_workflow_transitions`(`transition_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `task_transition_history`
    ADD CONSTRAINT `task_transition_history_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `work_tasks`
    ADD CONSTRAINT `work_tasks_workflow_status_id_fkey`
    FOREIGN KEY (`workflow_status_id`) REFERENCES `task_workflow_statuses`(`status_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one Standard workflow per existing project from current stages.
INSERT INTO `task_workflows` (`workflow_id`, `board_id`, `name`, `description`, `kind`, `active`, `is_default`, `created_at`, `updated_at`)
SELECT CONCAT('wf_', `board_id`), `board_id`, 'Project workflow', 'Preserved from existing board columns.', 'STANDARD', true, true, NOW(3), NOW(3)
FROM `task_boards`;

INSERT INTO `task_workflow_statuses` (
  `status_id`, `workflow_id`, `name`, `category`, `sort_order`, `color`, `is_initial`, `is_terminal`, `active`, `stage_id`
)
SELECT
  CONCAT('wfs_', `stage_id`),
  CONCAT('wf_', `board_id`),
  `name`,
  CASE
    WHEN `is_completed` = 1 OR `status_category` = 'DONE' THEN 'DONE'
    ELSE `status_category`
  END,
  `sort_order`,
  `color`,
  CASE WHEN `sort_order` = (
    SELECT MIN(s2.`sort_order`) FROM `task_stages` s2 WHERE s2.`board_id` = `task_stages`.`board_id`
  ) THEN true ELSE false END,
  CASE WHEN `is_completed` = 1 OR `status_category` = 'DONE' THEN true ELSE false END,
  true,
  `stage_id`
FROM `task_stages`;

INSERT INTO `task_workflow_transitions` (
  `transition_id`, `workflow_id`, `name`, `from_status_id`, `to_status_id`, `active`, `comment_required`, `resolution_required`
)
SELECT
  CONCAT('wft_', a.`status_id`, '_', b.`status_id`),
  a.`workflow_id`,
  CONCAT(a.`name`, ' → ', b.`name`),
  a.`status_id`,
  b.`status_id`,
  true,
  false,
  false
FROM `task_workflow_statuses` a
JOIN `task_workflow_statuses` b
  ON a.`workflow_id` = b.`workflow_id`
 AND b.`sort_order` = (
   SELECT MIN(c.`sort_order`)
   FROM `task_workflow_statuses` c
   WHERE c.`workflow_id` = a.`workflow_id` AND c.`sort_order` > a.`sort_order`
 );

-- Reopen: last DONE → last IN_PROGRESS (lead/admin)
INSERT INTO `task_workflow_transitions` (
  `transition_id`, `workflow_id`, `name`, `from_status_id`, `to_status_id`, `active`,
  `allowed_project_roles`, `comment_required`, `resolution_required`
)
SELECT
  CONCAT('wft_reopen_', done.`workflow_id`),
  done.`workflow_id`,
  'Reopen',
  done.`status_id`,
  progress.`status_id`,
  true,
  JSON_ARRAY('PROJECT_LEAD', 'PROJECT_ADMIN'),
  false,
  false
FROM `task_workflow_statuses` done
JOIN `task_workflow_statuses` progress
  ON progress.`workflow_id` = done.`workflow_id`
 AND progress.`category` = 'IN_PROGRESS'
 AND progress.`sort_order` = (
   SELECT MAX(p2.`sort_order`) FROM `task_workflow_statuses` p2
   WHERE p2.`workflow_id` = done.`workflow_id` AND p2.`category` = 'IN_PROGRESS'
 )
WHERE done.`category` = 'DONE'
  AND done.`sort_order` = (
    SELECT MAX(d2.`sort_order`) FROM `task_workflow_statuses` d2
    WHERE d2.`workflow_id` = done.`workflow_id` AND d2.`category` = 'DONE'
  );

UPDATE `work_tasks` wt
JOIN `task_workflow_statuses` ws ON ws.`stage_id` = wt.`stage_id`
SET wt.`workflow_status_id` = ws.`status_id`
WHERE wt.`stage_id` IS NOT NULL;

INSERT INTO `task_workflow_type_mappings` (`board_id`, `issue_type`, `workflow_id`)
SELECT `board_id`, issue.`issue_type`, `workflow_id`
FROM `task_workflows`
CROSS JOIN (
  SELECT 'TASK' AS `issue_type`
  UNION ALL SELECT 'STORY'
  UNION ALL SELECT 'IMPROVEMENT'
  UNION ALL SELECT 'BUG'
  UNION ALL SELECT 'SUBTASK'
  UNION ALL SELECT 'EPIC'
) AS issue
WHERE `task_workflows`.`is_default` = true;
