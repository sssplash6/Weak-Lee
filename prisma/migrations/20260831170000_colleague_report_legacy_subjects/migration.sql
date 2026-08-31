-- Names from a backfilled report that no longer match an account.
--
-- Reports filed before the ColleagueReport table existed live only in the text
-- of the admin notification, which names people rather than linking them. The
-- backfill resolves those names to users where it can; where it can't (renamed
-- or deleted account) the name is kept here rather than lost, so the record
-- still says who it was about.
--
-- Hand-written and idempotent.

ALTER TABLE "ColleagueReport" ADD COLUMN IF NOT EXISTS "legacyReporter" TEXT;
ALTER TABLE "ColleagueReport" ADD COLUMN IF NOT EXISTS "legacySubjects" TEXT;
