-- Add Chief of Staff login role (CoS org unit).
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM(
    'DEVELOPER_ADMIN',
    'MAIN_ADMIN',
    'CEO',
    'CHIEF_OF_STAFF',
    'HR',
    'MANAGER',
    'EMPLOYEE',
    'SALES',
    'DRIVER',
    'FIELD_STAFF'
  ) NOT NULL;
