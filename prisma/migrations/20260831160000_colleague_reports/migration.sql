-- Colleague reports become records, not just notifications.
--
-- The "Report a colleague" form on /penalties only ever fired REPORT
-- notifications at the admin accounts. Those fall out of the dashboard's
-- 48-hour updates window and vanish once read, so nobody could look up what
-- was reported last month, or say what had been done about it.
--
-- Hand-written and idempotent (Prisma applies statements in autocommit).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ColleagueReportStatus') THEN
    CREATE TYPE "ColleagueReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ColleagueReport" (
  "id"         TEXT NOT NULL,
  "reporterId" TEXT,
  "reason"     TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"     "ColleagueReportStatus" NOT NULL DEFAULT 'OPEN',
  "closedById" TEXT,
  "closedAt"   TIMESTAMP(3),
  "resolution" TEXT,
  CONSTRAINT "ColleagueReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ColleagueReportSubject" (
  "reportId" TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  CONSTRAINT "ColleagueReportSubject_pkey" PRIMARY KEY ("reportId", "userId")
);

CREATE INDEX IF NOT EXISTS "ColleagueReport_status_createdAt_idx" ON "ColleagueReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ColleagueReport_reporterId_idx" ON "ColleagueReport"("reporterId");
CREATE INDEX IF NOT EXISTS "ColleagueReportSubject_userId_idx" ON "ColleagueReportSubject"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ColleagueReport_reporterId_fkey') THEN
    ALTER TABLE "ColleagueReport" ADD CONSTRAINT "ColleagueReport_reporterId_fkey"
      FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ColleagueReport_closedById_fkey') THEN
    ALTER TABLE "ColleagueReport" ADD CONSTRAINT "ColleagueReport_closedById_fkey"
      FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ColleagueReportSubject_reportId_fkey') THEN
    ALTER TABLE "ColleagueReportSubject" ADD CONSTRAINT "ColleagueReportSubject_reportId_fkey"
      FOREIGN KEY ("reportId") REFERENCES "ColleagueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ColleagueReportSubject_userId_fkey') THEN
    ALTER TABLE "ColleagueReportSubject" ADD CONSTRAINT "ColleagueReportSubject_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
