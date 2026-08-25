-- Mini departments, and the first one: Alumni Council.
--
-- A mini department is a real department everywhere it matters — it shows in
-- the onboarding picker, on /team and in reporting — but it runs itself. Its
-- lead carries none of the lead expectations (no seat on the Monday meeting
-- roster, no weekly submission deadline), so no fine can ever arise from it,
-- and nobody appoints that lead: the first person to take a seat becomes it.
-- Someone who also leads a normal department still owes everything through
-- that seat.
--
-- Hand-written and idempotent (Prisma applies statements in autocommit, so a
-- retry after a mid-file failure runs over partial state).

-- AlterTable
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "mini" BOOLEAN NOT NULL DEFAULT false;

-- The Alumni Council itself. Its id follows the same shape the departments
-- backfill used; the ON CONFLICT keeps a re-run (or a hand-created row of the
-- same name) on the mini setting rather than failing.
INSERT INTO "Department" ("id", "name", "mini")
VALUES (md5('Alumni Council' || clock_timestamp()::text), 'Alumni Council', true)
ON CONFLICT ("name") DO UPDATE SET "mini" = true;
