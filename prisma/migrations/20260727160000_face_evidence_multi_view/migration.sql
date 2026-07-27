-- Allow multiple enrollment photos (centre/left/right) per face verification session
SET @idx := (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'face_evidence'
    AND CONSTRAINT_TYPE = 'UNIQUE'
    AND CONSTRAINT_NAME = 'face_evidence_session_id_key'
  LIMIT 1
);
SET @sql := IF(@idx IS NOT NULL, 'ALTER TABLE `face_evidence` DROP INDEX `face_evidence_session_id_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx2 := (
  SELECT INDEX_NAME FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'face_evidence'
    AND INDEX_NAME = 'face_evidence_session_id_idx'
  LIMIT 1
);
SET @sql2 := IF(@idx2 IS NULL, 'CREATE INDEX `face_evidence_session_id_idx` ON `face_evidence`(`session_id`)', 'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
