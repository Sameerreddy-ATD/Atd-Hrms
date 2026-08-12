-- CreateTable
CREATE TABLE `client_error_logs` (
    `log_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(32) NOT NULL DEFAULT 'error',
    `message` TEXT NOT NULL,
    `stack` TEXT NULL,
    `path` VARCHAR(512) NULL,
    `app_build_id` VARCHAR(64) NULL,
    `platform` VARCHAR(16) NULL,
    `is_native` BOOLEAN NOT NULL DEFAULT false,
    `user_agent` TEXT NULL,
    `viewport` VARCHAR(24) NULL,
    `user_id` VARCHAR(191) NULL,
    `role` VARCHAR(32) NULL,
    `ip_hash` VARCHAR(64) NULL,
    `occurred_at` DATETIME(3) NULL,
    `resolved` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `client_error_logs_created_at_idx`(`created_at`),
    INDEX `client_error_logs_platform_created_at_idx`(`platform`, `created_at`),
    INDEX `client_error_logs_app_build_id_idx`(`app_build_id`),
    INDEX `client_error_logs_resolved_created_at_idx`(`resolved`, `created_at`),
    PRIMARY KEY (`log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
