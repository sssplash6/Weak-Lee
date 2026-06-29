-- Backfill: weeks already submitted under the previous model (where submittedAt
-- doubled as the lock flag) should remain locked under the new goalsLocked flag.
UPDATE "Week" SET "goalsLocked" = true WHERE "submittedAt" IS NOT NULL;
