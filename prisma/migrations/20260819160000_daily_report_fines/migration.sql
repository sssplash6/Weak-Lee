-- Daily-report fines (rule set 2026-08-19): a weekday's report is due by 5 AM
-- Tashkent the next morning — $5 past that, $10 if still not in by 3 PM.
-- Every statement is guarded/idempotent: migration statements run in
-- autocommit here, so a half-applied attempt must be safely re-runnable.

-- The new fine type the daily sweep issues.
ALTER TYPE "PenaltyType" ADD VALUE IF NOT EXISTS 'LATE_DAILY_REPORT';

-- The Tashkent day (UTC-midnight key) a daily fine is for; null on every
-- other fine type.
ALTER TABLE "Penalty" ADD COLUMN IF NOT EXISTS "reportDay" TIMESTAMP(3);

-- At most one daily fine per person per day — the sweep's idempotency at the
-- database. NULLs are distinct in Postgres, so all existing fines (and every
-- future non-daily fine) stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "Penalty_userId_type_reportDay_key"
  ON "Penalty"("userId", "type", "reportDay");

-- The lazy no-cron claim for the 21:00 (Tashkent) "report not sent yet" nudge:
-- one row per day, created by whichever page load reaches the slot first.
CREATE TABLE IF NOT EXISTS "DailyReportReminder" (
    "day" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportReminder_pkey" PRIMARY KEY ("day")
);
