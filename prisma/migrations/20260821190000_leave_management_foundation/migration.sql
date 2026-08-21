-- Leave Management Foundation (additive)
-- - LeaveType policy columns (configurable; do not invent HR values)
-- - LeaveApprovalHistory append-only transitions
-- - LeaveStatus.WITHDRAWN

ALTER TABLE `leave_types`
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `max_carry_forward` DECIMAL(8, 2) NULL,
  ADD COLUMN `max_balance` DECIMAL(8, 2) NULL,
  ADD COLUMN `negative_balance_allowed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `half_day_allowed` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `min_notice_days` INT NULL,
  ADD COLUMN `backdated_allowed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `color_token` VARCHAR(40) NULL;

-- Preserve current production half-day behavior for Comp Off (full day only)
UPDATE `leave_types`
SET `half_day_allowed` = false
WHERE `code` = 'COMP_OFF';

ALTER TABLE `leave_requests`
  MODIFY COLUMN `status` ENUM(
    'PENDING',
    'MANAGER_APPROVED',
    'HR_VERIFIED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'WITHDRAWN'
  ) NOT NULL DEFAULT 'PENDING';

CREATE TABLE `leave_approval_history` (
  `history_id` VARCHAR(191) NOT NULL,
  `leave_request_id` VARCHAR(191) NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `action` VARCHAR(40) NOT NULL,
  `from_status` VARCHAR(32) NULL,
  `to_status` VARCHAR(32) NULL,
  `note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`history_id`),
  INDEX `leave_approval_history_leave_request_id_created_at_idx` (`leave_request_id`, `created_at`),
  INDEX `leave_approval_history_actor_user_id_created_at_idx` (`actor_user_id`, `created_at`),
  CONSTRAINT `leave_approval_history_leave_request_id_fkey`
    FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests` (`leave_request_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
