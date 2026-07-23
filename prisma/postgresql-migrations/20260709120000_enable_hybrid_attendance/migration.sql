ALTER TABLE "employees"
ALTER COLUMN "attendance_mode" SET DEFAULT 'BOTH';

UPDATE "employees"
SET "attendance_mode" = 'BOTH'
WHERE "attendance_mode" IN ('THUMB_ONLY', 'MOBILE_GPS_ONLY');
