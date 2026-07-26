-- Persist which user approved or rejected a leave request.
ALTER TABLE `leave_requests`
  ADD COLUMN `reviewed_by_user_id` VARCHAR(191) NULL,
  ADD INDEX `leave_requests_reviewed_by_user_id_idx`(`reviewed_by_user_id`);

ALTER TABLE `leave_requests`
  ADD CONSTRAINT `leave_requests_reviewed_by_user_id_fkey`
  FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
