-- CreateTable
CREATE TABLE `private_files` (
    `file_id` VARCHAR(191) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `uploaded_by_user_id` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(120) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `private_files_storage_key_key`(`storage_key`),
    INDEX `private_files_uploaded_by_user_id_kind_idx`(`uploaded_by_user_id`, `kind`),
    PRIMARY KEY (`file_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `private_files`
  ADD CONSTRAINT `private_files_uploaded_by_user_id_fkey`
  FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
