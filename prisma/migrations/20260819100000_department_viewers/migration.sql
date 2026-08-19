-- View-only access to an organization unit (and its children).
CREATE TABLE `department_viewer_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `department_id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `department_viewer_assignments_department_id_employee_id_key`(`department_id`, `employee_id`),
    INDEX `department_viewer_assignments_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `department_viewer_assignments`
  ADD CONSTRAINT `department_viewer_assignments_department_id_fkey`
  FOREIGN KEY (`department_id`) REFERENCES `departments`(`department_id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `department_viewer_assignments`
  ADD CONSTRAINT `department_viewer_assignments_employee_id_fkey`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
