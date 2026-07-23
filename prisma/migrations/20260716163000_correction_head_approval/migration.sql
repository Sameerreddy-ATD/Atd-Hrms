ALTER TABLE `attendance_correction_requests`
  ADD COLUMN `approver_id` VARCHAR(191) NULL AFTER `status`;

CREATE INDEX `attendance_correction_requests_approver_id_status_created_at_idx`
  ON `attendance_correction_requests`(`approver_id`, `status`, `created_at`);
