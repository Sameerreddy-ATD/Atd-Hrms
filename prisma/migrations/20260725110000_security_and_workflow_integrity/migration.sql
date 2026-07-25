-- Revoke existing browser sessions after security-sensitive account changes.
ALTER TABLE `users`
  ADD COLUMN `session_version` INTEGER NOT NULL DEFAULT 0;

-- The application and UI use PRINTED for a physical HR-document copy.
-- Normalize any legacy value before correcting the defense-in-depth constraint.
UPDATE `certificate_requests`
SET `delivery_mode` = 'PRINTED'
WHERE `delivery_mode` = 'PHYSICAL';

ALTER TABLE `certificate_requests`
  DROP CHECK `certificate_request_delivery_check`,
  ADD CONSTRAINT `certificate_request_delivery_check`
    CHECK (`delivery_mode` IN ('DIGITAL', 'PRINTED'));
