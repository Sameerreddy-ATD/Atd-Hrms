CREATE TABLE `deferred_punch_receipts` (
  `receipt_id` VARCHAR(191) NOT NULL,
  `employee_id` VARCHAR(191) NOT NULL,
  `nonce` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `synced_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `deferred_punch_receipts_nonce_key`(`nonce`),
  INDEX `deferred_punch_receipts_employee_id_captured_at_idx`(`employee_id`, `captured_at`),
  PRIMARY KEY (`receipt_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
