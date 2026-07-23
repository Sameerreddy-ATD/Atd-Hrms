CREATE INDEX `users_status_role_idx` ON `users`(`status`, `role`);

CREATE INDEX `attendance_daily_summary_date_status_idx`
  ON `attendance_daily_summary`(`date`, `status`);
CREATE INDEX `attendance_daily_summary_primary_attended_branch_id_date_idx`
  ON `attendance_daily_summary`(`primary_attended_branch_id`, `date`);

CREATE INDEX `field_attendance_employee_id_date_idx`
  ON `field_attendance`(`employee_id`, `date`);

CREATE INDEX `leave_requests_employee_id_created_at_idx`
  ON `leave_requests`(`employee_id`, `created_at`);
CREATE INDEX `leave_requests_manager_id_status_created_at_idx`
  ON `leave_requests`(`manager_id`, `status`, `created_at`);

CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs`(`created_at`);
CREATE INDEX `audit_logs_performed_by_user_id_created_at_idx`
  ON `audit_logs`(`performed_by_user_id`, `created_at`);

CREATE INDEX `attendance_correction_requests_employee_id_created_at_idx`
  ON `attendance_correction_requests`(`employee_id`, `created_at`);
CREATE INDEX `attendance_correction_requests_status_created_at_idx`
  ON `attendance_correction_requests`(`status`, `created_at`);
