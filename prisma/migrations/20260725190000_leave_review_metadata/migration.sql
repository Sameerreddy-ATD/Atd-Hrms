-- MySQL error 3823 prevents reviewed_by_user_id from participating in both a
-- CHECK constraint and this foreign key's referential actions. The API writes
-- reviewed_by_user_id and reviewed_at together in the same transaction.
ALTER TABLE `leave_requests`
  ADD COLUMN `reviewed_by_user_id` VARCHAR(191) NULL,
  ADD COLUMN `review_note` TEXT NULL,
  ADD COLUMN `reviewed_at` DATETIME(3) NULL,
  ADD INDEX `leave_requests_reviewed_by_user_id_idx` (`reviewed_by_user_id`),
  ADD CONSTRAINT `leave_requests_reviewed_by_user_id_fkey`
    FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
