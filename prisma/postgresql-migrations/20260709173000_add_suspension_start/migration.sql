ALTER TABLE "users" ADD COLUMN "suspension_starts_at" TIMESTAMP(3);

UPDATE "users"
SET "suspension_starts_at" = NOW()
WHERE "suspended_until" IS NOT NULL;
