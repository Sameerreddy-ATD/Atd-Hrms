CREATE TABLE `push_subscriptions` (
  `subscription_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `endpoint_hash` VARCHAR(64) NOT NULL,
  `p256dh` TEXT NOT NULL,
  `auth` TEXT NOT NULL,
  `user_agent` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `push_subscriptions_endpoint_hash_key`(`endpoint_hash`),
  INDEX `push_subscriptions_user_id_idx`(`user_id`),
  PRIMARY KEY (`subscription_id`),
  CONSTRAINT `push_subscriptions_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
