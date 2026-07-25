ALTER TABLE `attendance_daily_summary`
  MODIFY `total_hours` DECIMAL(12, 6) NOT NULL DEFAULT 0,
  MODIFY `office_hours` DECIMAL(12, 6) NOT NULL DEFAULT 0,
  MODIFY `field_hours` DECIMAL(12, 6) NOT NULL DEFAULT 0,
  MODIFY `client_visit_hours` DECIMAL(12, 6) NOT NULL DEFAULT 0;

-- Rebuild existing duration totals from the immutable punch ledger so values
-- previously rounded to two decimal hours regain second-level accuracy.
UPDATE `attendance_daily_summary` summary
INNER JOIN (
  SELECT
    paired.`employee_id`,
    paired.`event_date`,
    SUM(
      CASE
        WHEN paired.`event_type` IN ('OFFICE_OUT', 'BRANCH_OUT', 'FIELD_CHECK_OUT', 'CLIENT_CHECK_OUT', 'BREAK_OUT')
          AND paired.`previous_type` IN ('OFFICE_IN', 'BRANCH_IN', 'FIELD_CHECK_IN', 'CLIENT_CHECK_IN', 'BREAK_IN')
        THEN TIMESTAMPDIFF(MICROSECOND, paired.`previous_time`, paired.`event_time`) / 3600000000
        ELSE 0
      END
    ) AS `total_hours`,
    SUM(
      CASE
        WHEN paired.`event_type` IN ('OFFICE_OUT', 'BRANCH_OUT', 'BREAK_OUT')
          AND paired.`previous_type` IN ('OFFICE_IN', 'BRANCH_IN', 'BREAK_IN')
        THEN TIMESTAMPDIFF(MICROSECOND, paired.`previous_time`, paired.`event_time`) / 3600000000
        ELSE 0
      END
    ) AS `office_hours`,
    SUM(
      CASE
        WHEN paired.`event_type` = 'FIELD_CHECK_OUT'
          AND paired.`previous_type` = 'FIELD_CHECK_IN'
        THEN TIMESTAMPDIFF(MICROSECOND, paired.`previous_time`, paired.`event_time`) / 3600000000
        ELSE 0
      END
    ) AS `field_hours`,
    SUM(
      CASE
        WHEN paired.`event_type` = 'CLIENT_CHECK_OUT'
          AND paired.`previous_type` = 'CLIENT_CHECK_IN'
        THEN TIMESTAMPDIFF(MICROSECOND, paired.`previous_time`, paired.`event_time`) / 3600000000
        ELSE 0
      END
    ) AS `client_visit_hours`
  FROM (
    SELECT
      event.`employee_id`,
      event.`event_date`,
      event.`event_time`,
      event.`event_type`,
      LAG(event.`event_time`) OVER (
        PARTITION BY event.`employee_id`, event.`event_date`
        ORDER BY event.`event_time`, event.`event_id`
      ) AS `previous_time`,
      LAG(event.`event_type`) OVER (
        PARTITION BY event.`employee_id`, event.`event_date`
        ORDER BY event.`event_time`, event.`event_id`
      ) AS `previous_type`
    FROM `attendance_events` event
  ) paired
  GROUP BY paired.`employee_id`, paired.`event_date`
) calculated
  ON calculated.`employee_id` = summary.`employee_id`
 AND calculated.`event_date` = summary.`date`
SET
  summary.`total_hours` = calculated.`total_hours`,
  summary.`office_hours` = calculated.`office_hours`,
  summary.`field_hours` = calculated.`field_hours`,
  summary.`client_visit_hours` = calculated.`client_visit_hours`;

-- Mark historical open punches explicitly. This does not invent a checkout or
-- count an unverified open interval as worked time.
UPDATE `attendance_daily_summary` summary
INNER JOIN (
  SELECT ranked.`employee_id`, ranked.`event_date`, ranked.`event_type`, ranked.`event_time`
  FROM (
    SELECT
      event.`employee_id`,
      event.`event_date`,
      event.`event_type`,
      event.`event_time`,
      ROW_NUMBER() OVER (
        PARTITION BY event.`employee_id`, event.`event_date`
        ORDER BY event.`event_time` DESC, event.`event_id` DESC
      ) AS `position`
    FROM `attendance_events` event
  ) ranked
  WHERE ranked.`position` = 1
) latest
  ON latest.`employee_id` = summary.`employee_id`
 AND latest.`event_date` = summary.`date`
SET
  summary.`has_missing_out_event` =
    latest.`event_type` IN ('OFFICE_IN', 'BRANCH_IN', 'FIELD_CHECK_IN', 'CLIENT_CHECK_IN', 'BREAK_IN'),
  summary.`has_missed_checkout` =
    latest.`event_type` IN ('OFFICE_IN', 'BRANCH_IN', 'FIELD_CHECK_IN', 'CLIENT_CHECK_IN', 'BREAK_IN')
    AND latest.`event_time` <= UTC_TIMESTAMP(3) - INTERVAL 9 HOUR;
