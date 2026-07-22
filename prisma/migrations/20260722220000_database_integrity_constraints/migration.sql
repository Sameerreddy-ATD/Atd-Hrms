-- Defense-in-depth constraints for values already validated by the API.
-- These constraints prevent a future code path or manual import from persisting invalid state.

ALTER TABLE `employees`
  ADD CONSTRAINT `employees_version_check` CHECK (`version` >= 1),
  ADD CONSTRAINT `employees_shift_minutes_check` CHECK (`shift_start_minutes` BETWEEN 0 AND 1439 AND `shift_end_minutes` BETWEEN 0 AND 1439);

ALTER TABLE `branches`
  ADD CONSTRAINT `branches_coordinates_check` CHECK (
    (`latitude` IS NULL AND `longitude` IS NULL)
    OR (`latitude` BETWEEN -90 AND 90 AND `longitude` BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT `branches_attendance_radius_check` CHECK (`attendance_radius_meters` BETWEEN 25 AND 5000);

ALTER TABLE `attendance_daily_summary`
  ADD CONSTRAINT `attendance_totals_check` CHECK (
    `total_hours` >= 0 AND `office_hours` >= 0 AND `field_hours` >= 0 AND `client_visit_hours` >= 0
    AND `branch_movement_count` >= 0 AND `field_visit_count` >= 0 AND `client_visit_count` >= 0
  );

ALTER TABLE `field_attendance`
  ADD CONSTRAINT `field_attendance_time_check` CHECK (`check_out_time` IS NULL OR `check_out_time` >= `check_in_time`),
  ADD CONSTRAINT `field_attendance_checkout_coordinates_check` CHECK (
    (`check_out_latitude` IS NULL AND `check_out_longitude` IS NULL)
    OR (`check_out_latitude` IS NOT NULL AND `check_out_longitude` IS NOT NULL)
  );

ALTER TABLE `leave_requests`
  ADD CONSTRAINT `leave_request_range_check` CHECK (`to_date` >= `from_date` AND `days` > 0);

ALTER TABLE `expense_claims`
  ADD CONSTRAINT `expense_claim_amount_check` CHECK (`amount` > 0),
  ADD CONSTRAINT `expense_claim_type_check` CHECK (`claim_type` IN ('ADVANCE', 'EXPENSE')),
  ADD CONSTRAINT `expense_claim_status_check` CHECK (`status` IN ('PENDING', 'UNPAID', 'REJECTED', 'PAID')),
  ADD CONSTRAINT `expense_claim_required_fields_check` CHECK (
    (`claim_type` = 'ADVANCE' AND `remark` IS NOT NULL AND CHAR_LENGTH(TRIM(`remark`)) >= 2)
    OR (`claim_type` = 'EXPENSE' AND `title` IS NOT NULL AND `expense_date` IS NOT NULL AND `description` IS NOT NULL AND `receipt_url` IS NOT NULL)
  ),
  ADD CONSTRAINT `expense_claim_attachment_confirmation_check` CHECK (`receipt_url` IS NULL OR `receipt_access_confirmed` = 1),
  ADD CONSTRAINT `expense_claim_paid_time_check` CHECK (
    (`status` = 'PAID' AND `paid_at` IS NOT NULL) OR (`status` <> 'PAID' AND `paid_at` IS NULL)
  );

ALTER TABLE `certificate_requests`
  ADD CONSTRAINT `certificate_request_status_check` CHECK (`status` IN ('PENDING', 'IN_PROGRESS', 'READY', 'REJECTED', 'COLLECTED')),
  ADD CONSTRAINT `certificate_request_delivery_check` CHECK (`delivery_mode` IN ('DIGITAL', 'PHYSICAL')),
  ADD CONSTRAINT `certificate_request_digital_link_check` CHECK (
    `delivery_mode` <> 'DIGITAL' OR `status` NOT IN ('READY', 'COLLECTED') OR `document_url` IS NOT NULL
  );

ALTER TABLE `company_assets`
  ADD CONSTRAINT `company_asset_value_check` CHECK (`purchase_value` >= 0);

ALTER TABLE `work_tasks`
  ADD CONSTRAINT `work_tasks_version_check` CHECK (`version` >= 1),
  ADD CONSTRAINT `work_tasks_date_range_check` CHECK (`start_date` IS NULL OR `due_date` IS NULL OR `due_date` >= `start_date`),
  ADD CONSTRAINT `work_tasks_completion_check` CHECK (
    (`status` = 'COMPLETED' AND `progress` = 100 AND `completed_at` IS NOT NULL)
    OR (`status` <> 'COMPLETED' AND `completed_at` IS NULL)
  );
