CREATE TABLE `announcements` (
  `announcement_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
  `publish_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `announcements_is_active_publish_at_expires_at_idx`(`is_active`, `publish_at`, `expires_at`),
  PRIMARY KEY (`announcement_id`),
  CONSTRAINT `announcements_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
