-- Sign-up approval: non-company accounts may sign up now, but wait for a
-- department lead or admin to let them in. Existing users were all let in
-- long ago, so they're stamped approved on the spot. Guarded/idempotent like
-- every hand-written migration here (statements run in autocommit).

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Everyone already on the platform is approved by definition.
UPDATE "User" SET "approvedAt" = CURRENT_TIMESTAMP WHERE "approvedAt" IS NULL;
