-- The department a waiting sign-up says they're joining.
--
-- Asked on /pending BEFORE anyone approves them, because the approval queue
-- was unreviewable without it: the alert named a stranger and went to every
-- department lead in the company, none of whom could tell whose new joiner it
-- was. With this, the alert goes to that department's lead and tech@.
--
-- Deliberately NOT a DepartmentMembership. A membership is what every roster
-- reads (/team, the attendance sheet, eligibleEmployees), so creating one
-- before approval would put a stranger on those lists. Onboarding turns this
-- into the real seat once they are in.
--
-- ON DELETE SET NULL: deleting a department must not delete the people waiting
-- to join it. They fall back to the un-named case — every reviewer is told,
-- which is exactly the old behaviour and the right safety net.
--
-- Hand-written and idempotent (Prisma applies statements in autocommit, so a
-- retry after a mid-file failure runs over partial state).

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "requestedDepartmentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_requestedDepartmentId_idx" ON "User"("requestedDepartmentId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_requestedDepartmentId_fkey"
    FOREIGN KEY ("requestedDepartmentId") REFERENCES "Department"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
