CREATE TABLE `face_profiles` (
    `profile_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'DISABLED') NOT NULL DEFAULT 'PENDING',
    `descriptor_encrypted` LONGTEXT NOT NULL,
    `consent_version` VARCHAR(40) NOT NULL,
    `consented_at` DATETIME(3) NOT NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `approved_by_user_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_at` DATETIME(3) NULL,
    `rejection_reason` VARCHAR(500) NULL,
    `disabled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `face_profiles_user_id_key`(`user_id`),
    INDEX `face_profiles_status_submitted_at_idx`(`status`, `submitted_at`),
    PRIMARY KEY (`profile_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `face_verification_sessions` (
    `session_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `purpose` ENUM('ENROLLMENT', 'ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT') NOT NULL,
    `challenge` VARCHAR(40) NOT NULL,
    `nonce_hash` VARCHAR(64) NOT NULL,
    `device_id` VARCHAR(200) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `face_verification_sessions_nonce_hash_key`(`nonce_hash`),
    INDEX `face_verification_sessions_user_id_expires_at_idx`(`user_id`, `expires_at`),
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `face_evidence` (
    `evidence_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `attendance_event_id` VARCHAR(191) NULL,
    `purpose` ENUM('ENROLLMENT', 'ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT') NOT NULL,
    `outcome` ENUM('CREATED', 'PASSED', 'FAILED', 'EXPIRED') NOT NULL,
    `image_key` VARCHAR(500) NULL,
    `face_confidence` DECIMAL(6, 5) NULL,
    `liveness_score` DECIMAL(6, 5) NULL,
    `anti_spoof_score` DECIMAL(6, 5) NULL,
    `similarity_score` DECIMAL(6, 5) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `location_accuracy` DECIMAL(10, 2) NULL,
    `failure_reason` VARCHAR(500) NULL,
    `captured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `face_evidence_session_id_key`(`session_id`),
    UNIQUE INDEX `face_evidence_attendance_event_id_key`(`attendance_event_id`),
    INDEX `face_evidence_user_id_captured_at_idx`(`user_id`, `captured_at`),
    INDEX `face_evidence_expires_at_deleted_at_idx`(`expires_at`, `deleted_at`),
    INDEX `face_evidence_employee_id_captured_at_idx`(`employee_id`, `captured_at`),
    PRIMARY KEY (`evidence_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `face_profiles`
    ADD CONSTRAINT `face_profiles_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `face_profiles_approved_by_user_id_fkey`
    FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `face_verification_sessions`
    ADD CONSTRAINT `face_verification_sessions_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `face_evidence`
    ADD CONSTRAINT `face_evidence_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `face_evidence_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `face_evidence_session_id_fkey`
    FOREIGN KEY (`session_id`) REFERENCES `face_verification_sessions`(`session_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `face_evidence_attendance_event_id_fkey`
    FOREIGN KEY (`attendance_event_id`) REFERENCES `attendance_events`(`event_id`) ON DELETE SET NULL ON UPDATE CASCADE;
