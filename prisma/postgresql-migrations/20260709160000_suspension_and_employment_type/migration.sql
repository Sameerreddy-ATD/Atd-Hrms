ALTER TABLE "users" ADD COLUMN "suspended_until" TIMESTAMP(3);

UPDATE "employees"
SET "gender" = 'PREFER_NOT_TO_SAY'
WHERE "gender" = 'NON_BINARY';

ALTER TYPE "Gender" RENAME TO "Gender_old";
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'PREFER_NOT_TO_SAY');
ALTER TABLE "employees"
ALTER COLUMN "gender" TYPE "Gender"
USING ("gender"::text::"Gender");
DROP TYPE "Gender_old";

CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERN');
UPDATE "employees"
SET "employment_type" = CASE
  WHEN UPPER(REPLACE(COALESCE("employment_type", ''), '-', '_')) IN ('PART_TIME', 'PART TIME') THEN 'PART_TIME'
  WHEN UPPER(COALESCE("employment_type", '')) IN ('INTERN', 'INTERNSHIP') THEN 'INTERN'
  ELSE 'FULL_TIME'
END;
ALTER TABLE "employees"
ALTER COLUMN "employment_type" TYPE "EmploymentType"
USING ("employment_type"::"EmploymentType");
