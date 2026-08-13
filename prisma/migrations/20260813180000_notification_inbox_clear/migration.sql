ALTER TABLE `notification_preferences`
  ADD COLUMN `dismissed_ids` JSON NULL,
  ADD COLUMN `inbox_cleared_at` DATETIME(3) NULL;

UPDATE `notification_preferences`
SET `dismissed_ids` = JSON_ARRAY()
WHERE `dismissed_ids` IS NULL;
