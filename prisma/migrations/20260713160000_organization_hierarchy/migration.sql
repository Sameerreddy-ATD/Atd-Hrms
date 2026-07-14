ALTER TABLE `employees`
  ADD COLUMN `organization_level` VARCHAR(20) NOT NULL DEFAULT 'MEMBER';

ALTER TABLE `departments`
  ADD COLUMN `parent_department_id` VARCHAR(191) NULL,
  ADD COLUMN `unit_type` VARCHAR(20) NOT NULL DEFAULT 'TEAM',
  ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0,
  ADD INDEX `departments_parent_department_id_idx` (`parent_department_id`),
  ADD CONSTRAINT `departments_parent_department_id_fkey`
    FOREIGN KEY (`parent_department_id`) REFERENCES `departments` (`department_id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

INSERT IGNORE INTO `departments` (`department_id`, `name`, `unit_type`, `sort_order`) VALUES
  ('org_sales', 'Sales', 'TEAM', 10),
  ('org_operations', 'Operations', 'TEAM', 20),
  ('org_accounts', 'Accounts', 'TEAM', 30),
  ('org_administration', 'Administration', 'TEAM', 40),
  ('org_field_sales', 'Field Sales', 'SUBTEAM', 11),
  ('org_tele_sales', 'Tele Sales', 'SUBTEAM', 12),
  ('org_route_planning', 'Route Planning', 'SUBTEAM', 21),
  ('org_maintenance_parking', 'Maintenance & Parking Hub', 'SUBTEAM', 22),
  ('org_data_entry', 'Data Entry', 'SUBTEAM', 23),
  ('org_drivers', 'Drivers', 'SUBTEAM', 24);

UPDATE `departments` child
JOIN `departments` parent ON parent.`name` = 'Sales'
SET child.`parent_department_id` = parent.`department_id`, child.`unit_type` = 'SUBTEAM'
WHERE child.`name` IN ('Field Sales', 'Tele Sales');

UPDATE `departments` child
JOIN `departments` parent ON parent.`name` = 'Operations'
SET child.`parent_department_id` = parent.`department_id`, child.`unit_type` = 'SUBTEAM'
WHERE child.`name` IN ('Route Planning', 'Maintenance & Parking Hub', 'Data Entry', 'Drivers');
