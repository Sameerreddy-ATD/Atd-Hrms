-- Jira-like Work Planner: project keys, sequential issue keys, issue types, and board ranking.

ALTER TABLE `task_boards`
  ADD COLUMN `key_prefix` VARCHAR(8) NULL,
  ADD COLUMN `next_issue_number` INTEGER NOT NULL DEFAULT 1;

UPDATE `task_boards`
SET `key_prefix` = UPPER(LEFT(CONCAT('P', REPLACE(`board_id`, '-', '')), 4))
WHERE `key_prefix` IS NULL OR `key_prefix` = '';

-- Prefer letters from the board name when available.
UPDATE `task_boards`
SET `key_prefix` = UPPER(
  LEFT(
    REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`name`, 'BOARD'), ' ', ''), '-', ''), '_', ''), '.', ''),
    4
  )
)
WHERE CHAR_LENGTH(
  REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(`name`, ''), ' ', ''), '-', ''), '_', ''), '.', '')
) >= 2;

-- Break remaining collisions with board id suffix.
UPDATE `task_boards` b
INNER JOIN `task_boards` o
  ON o.`key_prefix` = b.`key_prefix`
 AND o.`board_id` < b.`board_id`
SET b.`key_prefix` = UPPER(LEFT(CONCAT(LEFT(b.`key_prefix`, 2), RIGHT(REPLACE(b.`board_id`, '-', ''), 2)), 4));

ALTER TABLE `task_boards`
  MODIFY COLUMN `key_prefix` VARCHAR(8) NOT NULL;

CREATE UNIQUE INDEX `task_boards_key_prefix_key` ON `task_boards`(`key_prefix`);

ALTER TABLE `work_tasks`
  ADD COLUMN `issue_number` INTEGER NULL,
  ADD COLUMN `issue_key` VARCHAR(32) NULL,
  ADD COLUMN `issue_type` ENUM('TASK', 'BUG', 'STORY', 'EPIC') NOT NULL DEFAULT 'TASK',
  ADD COLUMN `rank` DOUBLE NOT NULL DEFAULT 0;

-- Backfill issue numbers/keys one board at a time via temporary numbering table.
-- The collation must be stated explicitly: an unqualified temporary table
-- inherits the database default (utf8mb4_0900_ai_ci on a stock MySQL 8), which
-- cannot be joined against the utf8mb4_unicode_ci columns the baseline creates.
CREATE TEMPORARY TABLE `_task_issue_backfill` (
  `task_id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  `board_id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `seq_num` INTEGER NOT NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_task_issue_backfill` (`task_id`, `board_id`, `seq_num`)
SELECT
  `task_id`,
  `board_id`,
  ROW_NUMBER() OVER (PARTITION BY `board_id` ORDER BY `created_at`, `task_id`)
FROM `work_tasks`
WHERE `board_id` IS NOT NULL;

UPDATE `work_tasks` t
INNER JOIN `_task_issue_backfill` n ON n.`task_id` = t.`task_id`
INNER JOIN `task_boards` b ON b.`board_id` = t.`board_id`
SET
  t.`issue_number` = n.`seq_num`,
  t.`issue_key` = CONCAT(b.`key_prefix`, '-', n.`seq_num`),
  t.`rank` = n.`seq_num` * 1000;

UPDATE `task_boards` b
LEFT JOIN (
  SELECT `board_id`, COALESCE(MAX(`issue_number`), 0) AS max_num
  FROM `work_tasks`
  WHERE `board_id` IS NOT NULL
  GROUP BY `board_id`
) m ON m.`board_id` = b.`board_id`
SET b.`next_issue_number` = COALESCE(m.max_num, 0) + 1;

DROP TEMPORARY TABLE `_task_issue_backfill`;

CREATE UNIQUE INDEX `work_tasks_issue_key_key` ON `work_tasks`(`issue_key`);
CREATE UNIQUE INDEX `work_tasks_board_id_issue_number_key` ON `work_tasks`(`board_id`, `issue_number`);
CREATE INDEX `work_tasks_board_id_stage_id_rank_idx` ON `work_tasks`(`board_id`, `stage_id`, `rank`);
