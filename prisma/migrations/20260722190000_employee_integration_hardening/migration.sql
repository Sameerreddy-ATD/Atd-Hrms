-- Employee records are the canonical workforce profile. User rows mirror shared
-- contact fields only for authentication and display purposes.
ALTER TABLE `users`
  ADD COLUMN `deactivated_at` DATETIME(3) NULL;

ALTER TABLE `employees`
  ADD COLUMN `external_reference` VARCHAR(191) NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `terminated_at` DATETIME(3) NULL;

CREATE UNIQUE INDEX `employees_external_reference_key`
  ON `employees`(`external_reference`);

-- Backfill the account mirror from the canonical employee profile. Email is
-- synchronized only when it does not conflict with another account.
UPDATE `users` u
JOIN `employees` e ON e.`employee_id` = u.`employee_id`
SET u.`name` = e.`name`, u.`phone` = e.`phone`;

UPDATE `users` u
JOIN `employees` e ON e.`employee_id` = u.`employee_id`
LEFT JOIN `users` conflict ON conflict.`email` = e.`email` AND conflict.`id` <> u.`id`
SET u.`email` = e.`email`
WHERE e.`email` IS NOT NULL AND conflict.`id` IS NULL;

UPDATE `users` u
JOIN `employees` e ON e.`employee_id` = u.`employee_id`
SET u.`deactivated_at` = COALESCE(u.`deactivated_at`, CURRENT_TIMESTAMP(3))
WHERE u.`status` = 'INACTIVE' OR e.`status` = 'INACTIVE';

UPDATE `employees` e
JOIN `users` u ON u.`employee_id` = e.`employee_id`
SET e.`status` = IF(e.`status` = 'ACTIVE', 'INACTIVE', e.`status`),
    e.`terminated_at` = COALESCE(e.`terminated_at`, u.`deactivated_at`, CURRENT_TIMESTAMP(3))
WHERE u.`status` = 'INACTIVE';

UPDATE `users` u
JOIN `employees` e ON e.`employee_id` = u.`employee_id`
SET u.`status` = 'INACTIVE',
    u.`deactivated_at` = COALESCE(u.`deactivated_at`, e.`terminated_at`, CURRENT_TIMESTAMP(3))
WHERE e.`status` <> 'ACTIVE';

ALTER TABLE `expense_claims`
  ADD COLUMN `receipt_access_confirmed` BOOLEAN NOT NULL DEFAULT false;

-- Remove legacy dangling reviewer values before enforcing referential integrity.
UPDATE `expense_claims` ec
LEFT JOIN `users` u ON u.`id` = ec.`reviewed_by_user_id`
SET ec.`reviewed_by_user_id` = NULL
WHERE ec.`reviewed_by_user_id` IS NOT NULL AND u.`id` IS NULL;

UPDATE `certificate_requests` cr
LEFT JOIN `users` u ON u.`id` = cr.`reviewed_by_user_id`
SET cr.`reviewed_by_user_id` = NULL
WHERE cr.`reviewed_by_user_id` IS NOT NULL AND u.`id` IS NULL;

CREATE INDEX `expense_claims_reviewed_by_user_id_idx`
  ON `expense_claims`(`reviewed_by_user_id`);
CREATE INDEX `certificate_requests_reviewed_by_user_id_idx`
  ON `certificate_requests`(`reviewed_by_user_id`);

ALTER TABLE `expense_claims`
  ADD CONSTRAINT `expense_claims_reviewed_by_user_id_fkey`
  FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `certificate_requests`
  ADD CONSTRAINT `certificate_requests_reviewed_by_user_id_fkey`
  FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `integration_clients` (
  `client_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `key_prefix` VARCHAR(24) NOT NULL,
  `secret_hash` VARCHAR(64) NOT NULL,
  `scopes` JSON NOT NULL,
  `status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  `expires_at` DATETIME(3) NULL,
  `last_used_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_by_user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `integration_clients_key_prefix_key`(`key_prefix`),
  UNIQUE INDEX `integration_clients_secret_hash_key`(`secret_hash`),
  INDEX `integration_clients_status_expires_at_idx`(`status`, `expires_at`),
  PRIMARY KEY (`client_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `integration_idempotency` (
  `idempotency_id` VARCHAR(191) NOT NULL,
  `client_id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(200) NOT NULL,
  `request_hash` VARCHAR(64) NOT NULL,
  `response_code` INTEGER NOT NULL,
  `response_body` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `integration_idempotency_client_id_key_key`(`client_id`, `key`),
  INDEX `integration_idempotency_expires_at_idx`(`expires_at`),
  PRIMARY KEY (`idempotency_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_change_events` (
  `sequence` BIGINT NOT NULL AUTO_INCREMENT,
  `event_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NULL,
  `event_type` ENUM('CREATED', 'UPDATED', 'DEACTIVATED', 'REACTIVATED') NOT NULL,
  `version` INTEGER NOT NULL,
  `payload` JSON NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `employee_change_events_event_id_key`(`event_id`),
  INDEX `employee_change_events_employee_id_sequence_idx`(`employee_id`, `sequence`),
  INDEX `employee_change_events_occurred_at_idx`(`occurred_at`),
  PRIMARY KEY (`sequence`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `integration_clients`
  ADD CONSTRAINT `integration_clients_created_by_user_id_fkey`
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `integration_idempotency`
  ADD CONSTRAINT `integration_idempotency_client_id_fkey`
  FOREIGN KEY (`client_id`) REFERENCES `integration_clients`(`client_id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_change_events`
  ADD CONSTRAINT `employee_change_events_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
