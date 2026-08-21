-- Shift / Roster foundation: segments, template metadata, roster shift FK, day overrides.
-- Preserves shift_definitions.shift_id and employee_shift_assignments references.

ALTER TABLE `shift_definitions`
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN `grace_in_minutes` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `grace_out_minutes` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `expected_work_minutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `color_token` VARCHAR(40) NULL;

CREATE TABLE `shift_segments` (
  `id` VARCHAR(191) NOT NULL,
  `shift_id` VARCHAR(191) NOT NULL,
  `sequence` INTEGER NOT NULL DEFAULT 1,
  `start_minute` INTEGER NOT NULL,
  `end_minute` INTEGER NOT NULL,
  `end_day_offset` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `shift_segments_shift_id_sequence_key`(`shift_id`, `sequence`),
  INDEX `shift_segments_shift_id_idx`(`shift_id`),
  CONSTRAINT `shift_segments_shift_id_fkey`
    FOREIGN KEY (`shift_id`) REFERENCES `shift_definitions`(`shift_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill one segment per legacy shift. Cross-midnight when end <= start.
INSERT INTO `shift_segments` (
  `id`, `shift_id`, `sequence`, `start_minute`, `end_minute`, `end_day_offset`, `created_at`, `updated_at`
)
SELECT
  CONCAT('seg_', REPLACE(UUID(), '-', '')),
  s.`shift_id`,
  1,
  s.`start_minutes`,
  s.`end_minutes`,
  CASE WHEN s.`end_minutes` <= s.`start_minutes` THEN 1 ELSE 0 END,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `shift_definitions` s
WHERE NOT EXISTS (
  SELECT 1 FROM `shift_segments` seg WHERE seg.`shift_id` = s.`shift_id`
);

UPDATE `shift_definitions` s
SET `expected_work_minutes` = (
  SELECT
    CASE
      WHEN seg.`end_day_offset` = 0 THEN GREATEST(seg.`end_minute` - seg.`start_minute`, 0)
      ELSE (1440 - seg.`start_minute`) + seg.`end_minute`
    END
  FROM `shift_segments` seg
  WHERE seg.`shift_id` = s.`shift_id` AND seg.`sequence` = 1
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM `shift_segments` seg WHERE seg.`shift_id` = s.`shift_id`
);

ALTER TABLE `employee_shift_assignments`
  ADD COLUMN `assignment_type` VARCHAR(30) NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN `reason` TEXT NULL;

CREATE INDEX `esa_employee_type_effective_idx`
  ON `employee_shift_assignments`(`employee_id`, `assignment_type`, `effective_from`, `effective_to`);

ALTER TABLE `roster_assignments`
  ADD COLUMN `shift_id` VARCHAR(191) NULL,
  ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `created_by` VARCHAR(191) NULL;

ALTER TABLE `roster_assignments`
  ADD CONSTRAINT `roster_assignments_shift_id_fkey`
    FOREIGN KEY (`shift_id`) REFERENCES `shift_definitions`(`shift_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX `roster_assignments_shift_id_idx` ON `roster_assignments`(`shift_id`);

CREATE TABLE `employee_shift_day_overrides` (
  `id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `work_date` DATE NOT NULL,
  `shift_id` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `employee_shift_day_overrides_employee_id_work_date_key`(`employee_id`, `work_date`),
  INDEX `employee_shift_day_overrides_shift_id_idx`(`shift_id`),
  CONSTRAINT `employee_shift_day_overrides_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `employee_shift_day_overrides_shift_id_fkey`
    FOREIGN KEY (`shift_id`) REFERENCES `shift_definitions`(`shift_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
