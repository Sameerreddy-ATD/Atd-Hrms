ALTER TABLE `leave_requests`
  ADD COLUMN `reviewed_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `review_note` TEXT NULL,
  ADD COLUMN `reviewed_at` DATETIME(3) NULL,
  ADD INDEX `leave_requests_reviewed_by_user_id_idx` (`reviewed_by_user_id`),
  ADD CONSTRAINT `leave_request_review_pair_check` CHECK (
    (`reviewed_by_user_id` IS NULL AND `reviewed_at` IS NULL)
    OR (`reviewed_by_user_id` IS NOT NULL AND `reviewed_at` IS NOT NULL)
  ),
  ADD CONSTRAINT `leave_requests_reviewed_by_user_id_fkey`
    FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
