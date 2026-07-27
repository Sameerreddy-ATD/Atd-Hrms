-- Allow multiple enrollment photos (centre/left/right) per face verification session.
-- MySQL cannot drop the unique session_id index while the FK still depends on it.

-- 1) Drop the foreign key that depends on the unique index (if present)
SET @fk := (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'face_evidence'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'face_evidence_session_id_fkey'
  LIMIT 1
);
SET @sql := IF(
  @fk IS NOT NULL,
  'ALTER TABLE `face_evidence` DROP FOREIGN KEY `face_evidence_session_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Drop the unique index (if present)
SET @idx := (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'face_evidence'
    AND INDEX_NAME = 'face_evidence_session_id_key'
  LIMIT 1
);
SET @sql := IF(
  @idx IS NOT NULL,
  'ALTER TABLE `face_evidence` DROP INDEX `face_evidence_session_id_key`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Create a non-unique index for session lookups (if missing)
SET @idx2 := (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'face_evidence'
    AND INDEX_NAME = 'face_evidence_session_id_idx'
  LIMIT 1
);
SET @sql := IF(
  @idx2 IS NULL,
  'CREATE INDEX `face_evidence_session_id_idx` ON `face_evidence`(`session_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) Restore the foreign key on the non-unique index
SET @fk2 := (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'face_evidence'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'face_evidence_session_id_fkey'
  LIMIT 1
);
SET @sql := IF(
  @fk2 IS NULL,
  'ALTER TABLE `face_evidence` ADD CONSTRAINT `face_evidence_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `face_verification_sessions`(`session_id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
