-- Module 1: Organization structure foundation
-- Backfill rules documented in docs/ORGANIZATION_STRUCTURE.md

-- ─── Department metadata ───
ALTER TABLE `departments`
  ADD COLUMN `unit_code` VARCHAR(60) NULL,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- Stable codes for known production units (match by normalized name)
UPDATE `departments` SET `unit_code` = 'EXECUTIVE_LEADERSHIP'
  WHERE LOWER(TRIM(`name`)) IN ('executive leadership');

UPDATE `departments` SET `unit_code` = 'CHIEF_OF_STAFF'
  WHERE LOWER(TRIM(`name`)) IN ('chief of staff', 'cos');

UPDATE `departments` SET `unit_code` = 'CHIEF_OF_OPERATIONS'
  WHERE LOWER(TRIM(`name`)) IN ('chief of operations');

UPDATE `departments` SET `unit_code` = 'SALES_TEAM'
  WHERE LOWER(TRIM(`name`)) IN ('sales team', 'sales');

UPDATE `departments` SET `unit_code` = 'OPERATIONS'
  WHERE LOWER(TRIM(`name`)) IN ('operations department', 'operations');

UPDATE `departments` SET `unit_code` = 'MAINTENANCE'
  WHERE LOWER(TRIM(`name`)) IN ('maintenance manager', 'maintenance & parking hub', 'maintenance');

UPDATE `departments` SET `unit_code` = 'PROCUREMENT'
  WHERE LOWER(TRIM(`name`)) = 'procurement';

UPDATE `departments` SET `unit_code` = 'FLEET_DRIVER'
  WHERE LOWER(TRIM(`name`)) IN ('fleet & driver team', 'fleet and driver team', 'drivers');

UPDATE `departments` SET `unit_code` = 'ANALYTICS'
  WHERE LOWER(TRIM(`name`)) = 'analytics';

UPDATE `departments` SET `unit_code` = 'ROUTING_PLANNING'
  WHERE LOWER(TRIM(`name`)) IN ('routing & planning', 'route planning', 'routing and planning');

UPDATE `departments` SET `unit_code` = 'SPECIAL_PROJECTS'
  WHERE LOWER(TRIM(`name`)) = 'special projects';

UPDATE `departments` SET `unit_code` = 'PRINCIPAL_ADVISOR'
  WHERE LOWER(TRIM(`name`)) = 'principal advisor';

UPDATE `departments` SET `unit_code` = 'HR'
  WHERE LOWER(TRIM(`name`)) IN ('hr department', 'human resources', 'hr');

UPDATE `departments` SET `unit_code` = 'INTERNS'
  WHERE LOWER(TRIM(`name`)) = 'interns';

UPDATE `departments` SET `unit_code` = 'SOFTWARE'
  WHERE LOWER(TRIM(`name`)) = 'software';

UPDATE `departments` SET `unit_code` = 'INSIDE_SALES'
  WHERE LOWER(TRIM(`name`)) IN ('inside sales', 'tele sales');

UPDATE `departments` SET `unit_code` = 'MARKETING'
  WHERE LOWER(TRIM(`name`)) = 'marketing';

UPDATE `departments` SET `unit_code` = 'ACCOUNTS'
  WHERE LOWER(TRIM(`name`)) IN ('accounts team', 'accounts');

UPDATE `departments` SET `unit_code` = 'ADVISOR_GROWTH_STRATEGY'
  WHERE LOWER(TRIM(`name`)) IN ('advisor growth & strategy', 'advisor growth and strategy');

UPDATE `departments` SET `unit_code` = 'COMPLIANCE'
  WHERE LOWER(TRIM(`name`)) = 'compliance';

UPDATE `departments` SET `unit_code` = 'FIELD_SALES'
  WHERE LOWER(TRIM(`name`)) = 'field sales' AND `unit_code` IS NULL;

UPDATE `departments` SET `unit_code` = 'ADMINISTRATION'
  WHERE LOWER(TRIM(`name`)) = 'administration' AND `unit_code` IS NULL;

UPDATE `departments` SET `unit_code` = 'DATA_ENTRY'
  WHERE LOWER(TRIM(`name`)) IN ('data entry') AND `unit_code` IS NULL;

-- Fallback: uppercase snake from name for any remaining rows
UPDATE `departments`
SET `unit_code` = UPPER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(TRIM(`name`), '[^A-Za-z0-9]+', '_'),
    '^_|_$',
    ''
  )
)
WHERE `unit_code` IS NULL OR TRIM(`unit_code`) = '';

-- Resolve accidental duplicates from fallback by appending department_id suffix
UPDATE `departments` d
JOIN (
  SELECT `unit_code`, MIN(`department_id`) AS keep_id, COUNT(*) AS c
  FROM `departments`
  GROUP BY `unit_code`
  HAVING c > 1
) dup ON d.`unit_code` = dup.`unit_code` AND d.`department_id` <> dup.keep_id
SET d.`unit_code` = CONCAT(d.`unit_code`, '_', LEFT(d.`department_id`, 8));

ALTER TABLE `departments`
  MODIFY `unit_code` VARCHAR(60) NOT NULL,
  ADD UNIQUE INDEX `departments_unit_code_key`(`unit_code`),
  ADD INDEX `departments_active_idx`(`active`);

-- ─── Head assignment history columns ───
ALTER TABLE `department_head_assignments`
  ADD COLUMN `is_primary` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `effective_from` DATE NULL,
  ADD COLUMN `effective_to` DATE NULL,
  ADD COLUMN `assigned_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `reason` TEXT NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

UPDATE `department_head_assignments`
SET
  `effective_from` = COALESCE(DATE(`created_at`), CURDATE()),
  `effective_to` = NULL,
  `is_primary` = (`sort_order` = 0);

-- First head per department becomes primary when none marked (MySQL-safe: no self-ref in UPDATE)
UPDATE `department_head_assignments` ha
INNER JOIN (
  SELECT f.first_id
  FROM (
    SELECT `department_id`, MIN(`id`) AS first_id
    FROM `department_head_assignments`
    GROUP BY `department_id`
  ) f
  LEFT JOIN (
    SELECT DISTINCT `department_id`
    FROM `department_head_assignments`
    WHERE `is_primary` = true
  ) p ON p.`department_id` = f.`department_id`
  WHERE p.`department_id` IS NULL
) pick ON ha.`id` = pick.first_id
SET ha.`is_primary` = true;

ALTER TABLE `department_head_assignments`
  MODIFY `effective_from` DATE NOT NULL;

CREATE INDEX `dha_dept_effective_idx`
  ON `department_head_assignments`(`department_id`, `effective_from`, `effective_to`);

CREATE INDEX `dha_employee_effective_idx`
  ON `department_head_assignments`(`employee_id`, `effective_from`, `effective_to`);

DROP INDEX `department_head_assignments_department_id_employee_id_key` ON `department_head_assignments`;

-- ─── Viewer assignment history columns ───
ALTER TABLE `department_viewer_assignments`
  ADD COLUMN `effective_from` DATE NULL,
  ADD COLUMN `effective_to` DATE NULL,
  ADD COLUMN `assigned_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `reason` TEXT NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

UPDATE `department_viewer_assignments`
SET
  `effective_from` = COALESCE(DATE(`created_at`), CURDATE()),
  `effective_to` = NULL;

ALTER TABLE `department_viewer_assignments`
  MODIFY `effective_from` DATE NOT NULL;

CREATE INDEX `dva_dept_effective_idx`
  ON `department_viewer_assignments`(`department_id`, `effective_from`, `effective_to`);

CREATE INDEX `dva_employee_effective_idx`
  ON `department_viewer_assignments`(`employee_id`, `effective_from`, `effective_to`);

DROP INDEX `department_viewer_assignments_department_id_employee_id_key` ON `department_viewer_assignments`;

-- ─── Employee organization assignment history ───
CREATE TABLE `employee_organization_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `department_id` VARCHAR(191) NOT NULL,
  `organization_level` VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
  `is_primary` BOOLEAN NOT NULL DEFAULT true,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `changed_by_user_id` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `eoa_employee_primary_idx`(
    `employee_id`, `is_primary`, `effective_from`, `effective_to`
  ),
  INDEX `eoa_dept_effective_idx`(
    `department_id`, `effective_from`, `effective_to`
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `employee_organization_assignments`
  ADD CONSTRAINT `employee_organization_assignments_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `employee_organization_assignments_department_id_fkey`
    FOREIGN KEY (`department_id`) REFERENCES `departments`(`department_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one active primary assignment per employee with a department
INSERT INTO `employee_organization_assignments` (
  `id`, `employee_id`, `department_id`, `organization_level`, `is_primary`,
  `effective_from`, `effective_to`, `reason`, `created_at`, `updated_at`
)
SELECT
  CONCAT('eoa_', e.`employee_id`),
  e.`employee_id`,
  e.`department_id`,
  e.`organization_level`,
  true,
  COALESCE(e.`joining_date`, DATE(e.`created_at`), CURDATE()),
  NULL,
  'Backfilled from employees.department_id during Module 1 migration',
  e.`created_at`,
  e.`updated_at`
FROM `employees` e
WHERE e.`department_id` IS NOT NULL;
