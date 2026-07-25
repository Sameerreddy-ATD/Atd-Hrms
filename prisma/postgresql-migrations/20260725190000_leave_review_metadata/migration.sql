ALTER TABLE "leave_requests"
  ADD COLUMN "reviewed_by_user_id" TEXT,
  ADD COLUMN "review_note" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3);

CREATE INDEX "leave_requests_reviewed_by_user_id_idx"
  ON "leave_requests"("reviewed_by_user_id");

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_request_review_pair_check"
  CHECK (
    ("reviewed_by_user_id" IS NULL AND "reviewed_at" IS NULL)
    OR ("reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "leave_requests_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
