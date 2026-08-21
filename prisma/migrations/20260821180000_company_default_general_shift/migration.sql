-- Company default General Shift (prospective fallback only).
-- Reuses shift-morning-0930 (09:30–18:30, 540 expected minutes) when timing matches.
-- Does NOT rewrite historical attendance_workdays schedule snapshots.

-- Free the display name if a different template incorrectly used "General Shift"
UPDATE `shift_definitions`
SET `name` = 'Day Shift 09:00–18:00'
WHERE `code` = 'GENERAL_0900_1800'
  AND `name` = 'General Shift'
  AND NOT (`start_minutes` = 570 AND `end_minutes` = 1110);

-- Rename canonical company shift display name only (timing unchanged)
UPDATE `shift_definitions`
SET `name` = 'General Shift',
    `expected_work_minutes` = 540,
    `timezone` = 'Asia/Kolkata'
WHERE `shift_id` = 'shift-morning-0930'
  AND `start_minutes` = 570
  AND `end_minutes` = 1110
  AND `name` <> 'General Shift';

UPDATE `shift_definitions`
SET `expected_work_minutes` = 540
WHERE `shift_id` = 'shift-morning-0930'
  AND `start_minutes` = 570
  AND `end_minutes` = 1110
  AND `expected_work_minutes` <> 540;

-- Ensure a segment exists for the canonical shift
INSERT INTO `shift_segments` (
  `id`, `shift_id`, `sequence`, `start_minute`, `end_minute`, `end_day_offset`, `created_at`, `updated_at`
)
SELECT
  CONCAT('seg_gen_', REPLACE(UUID(), '-', '')),
  'shift-morning-0930',
  1,
  570,
  1110,
  0,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE EXISTS (
  SELECT 1 FROM `shift_definitions`
  WHERE `shift_id` = 'shift-morning-0930'
    AND `start_minutes` = 570
    AND `end_minutes` = 1110
)
AND NOT EXISTS (
  SELECT 1 FROM `shift_segments` WHERE `shift_id` = 'shift-morning-0930'
);

-- Pointer: attendance.defaultShiftId → General Shift (do not overwrite a custom non-empty value)
INSERT INTO `system_settings` (`key`, `value`, `created_at`, `updated_at`)
VALUES ('attendance.defaultShiftId', 'shift-morning-0930', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `value` = IF(`value` IS NULL OR TRIM(`value`) = '', 'shift-morning-0930', `value`),
  `updated_at` = CURRENT_TIMESTAMP(3);
