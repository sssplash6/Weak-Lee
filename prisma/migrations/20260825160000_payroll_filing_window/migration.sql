-- Payroll filing gets a narrow window instead of the whole month.
--
-- Filing used to be open from the 1st until 23:59:59 on the month's last day,
-- with no opening bound at all. It is now the last three days of the month
-- plus the first day of the next one, Asia/Tashkent throughout:
--
--   opens  00:00:00 on (last day − 2)   e.g. Aug 29th 00:00:00
--   closes 23:59:59 on the 1st of M+1   e.g. Sep  1st 23:59:59
--
-- So the opening bound is a new stored column, and the existing closing bound
-- has to MOVE — it currently lands on the last day of the month, a day and a
-- bit earlier than the new rule. `remindAt` moves too: it used to fire 09:00
-- four days before the month ended, which under the new rule is before filing
-- is even possible, so it becomes 09:00 on the opening day.
--
-- Every boundary is derived from `endsAt` (midnight starting the 1st of M+1,
-- in Tashkent, already stored as the right UTC instant). Tashkent is UTC+5
-- with no DST, so plain day arithmetic on that instant is exact — no timezone
-- functions needed, and no dependence on the server's own zone:
--
--   filingOpensAt  = endsAt − 3 days              (last day − 2, 00:00)
--   filingClosesAt = endsAt + 1 day − 1 second    (1st of M+1, 23:59:59)
--   remindAt       = endsAt − 3 days + 9 hours    (opening day, 09:00)
--
-- Existing rows are rewritten onto the new rule wholesale. Payroll launched in
-- August 2026 and periods are created on demand, so at most a handful of rows
-- exist and none of them predates the feature.
--
-- Hand-written and idempotent (Prisma applies statements in autocommit, so a
-- retry after a mid-file failure runs over partial state). Each UPDATE's WHERE
-- clause matches only rows still carrying the OLD rule, which makes a re-run a
-- no-op rather than a second shift.

-- AlterTable: nullable first, backfilled below, then tightened to NOT NULL —
-- the column has no sensible default and the table is never empty in practice.
ALTER TABLE "PayrollPeriod" ADD COLUMN IF NOT EXISTS "filingOpensAt" TIMESTAMP(3);

UPDATE "PayrollPeriod"
SET "filingOpensAt" = "endsAt" - INTERVAL '3 days'
WHERE "filingOpensAt" IS NULL;

ALTER TABLE "PayrollPeriod" ALTER COLUMN "filingOpensAt" SET NOT NULL;

-- Move the cutoff onto the 1st of the following month. Old rows put it one
-- second BEFORE `endsAt`; new rows put it nearly a day after, so this WHERE
-- distinguishes the two exactly.
UPDATE "PayrollPeriod"
SET "filingClosesAt" = "endsAt" + INTERVAL '1 day' - INTERVAL '1 second'
WHERE "filingClosesAt" < "endsAt";

-- Move the reminder into the window. Old rows sit at endsAt − 4 days + 9h,
-- new rows at endsAt − 3 days + 9h; anything before endsAt − 3 days is old.
UPDATE "PayrollPeriod"
SET "remindAt" = "endsAt" - INTERVAL '3 days' + INTERVAL '9 hours'
WHERE "remindAt" < "endsAt" - INTERVAL '3 days';
