-- Allow the same unit name under different parents (e.g. "Sales" under each
-- of several sub-heads). Sibling uniqueness among siblings is enforced in the API.
DROP INDEX `departments_name_key` ON `departments`;
CREATE INDEX `departments_name_idx` ON `departments`(`name`);
