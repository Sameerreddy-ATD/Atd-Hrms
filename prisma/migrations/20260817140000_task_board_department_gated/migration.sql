-- Replace role-gated board access with organization-unit (department) gating.

ALTER TABLE `task_boards`
  MODIFY COLUMN `access_type` ENUM('OPEN', 'ROLE_GATED', 'MEMBER_GATED', 'DEPARTMENT_GATED') NOT NULL DEFAULT 'OPEN';

CREATE TABLE `task_board_departments` (
    `board_id` VARCHAR(191) NOT NULL,
    `department_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`board_id`, `department_id`),
    INDEX `task_board_departments_department_id_idx`(`department_id`),
    CONSTRAINT `task_board_departments_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `task_boards`(`board_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `task_board_departments_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`department_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Existing role-gated boards become open until an admin picks units.
UPDATE `task_boards` SET `access_type` = 'OPEN' WHERE `access_type` = 'ROLE_GATED';

DROP TABLE IF EXISTS `task_board_roles`;

ALTER TABLE `task_boards`
  MODIFY COLUMN `access_type` ENUM('OPEN', 'DEPARTMENT_GATED', 'MEMBER_GATED') NOT NULL DEFAULT 'OPEN';
