-- Departments become first-class and every person gets a role label.
--
-- Until now User.department was free text people typed at onboarding. This
-- migration turns those strings into Department rows, links each user to one,
-- labels the department leads (role LEAD — the ops director counts as one),
-- and only then drops the old text column. Hand-written; every step is
-- guarded/idempotent because Prisma applies statements in autocommit, so a
-- retry after a mid-file failure must be able to run over partial state.

-- CreateEnum (no IF NOT EXISTS for types — swallow the duplicate instead)
DO $$ BEGIN
  CREATE TYPE "TeamRole" AS ENUM ('LEAD', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Department_name_key" ON "Department"("name");

-- AlterTable (the old free-text column is dropped at the end, after the backfill)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "TeamRole" NOT NULL DEFAULT 'MEMBER';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_departmentId_idx" ON "User"("departmentId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------- backfill
--
-- The canonicalization CASE below appears twice (once to create departments,
-- once to link users) because each statement runs in its own autocommit
-- transaction — a temp table wouldn't survive between them. Keep the two in
-- sync if this is ever edited. Two fixups fold job titles and spelling
-- variants into real departments: "Ops. Director" / "office manager" belong
-- to Operations, and the "Global Admission(s) ..." variants are one
-- department. Everything else keeps its (trimmed) name and can be renamed on
-- /departments.

-- One Department row per distinct canonical name (case-insensitively deduped).
INSERT INTO "Department" ("id", "name")
SELECT md5(d.dept || clock_timestamp()::text), d.dept
FROM (
  SELECT DISTINCT ON (lower(c.dept)) c.dept
  FROM (
    SELECT CASE
      WHEN lower(btrim(u."department")) IN
        ('ops. director', 'ops director', 'operations', 'office manager', 'office management')
        THEN 'Operations'
      WHEN lower(btrim(u."department")) LIKE 'global admission%'
        THEN 'Global Admissions'
      ELSE btrim(u."department")
    END AS dept
    FROM "User" u
    WHERE u."department" IS NOT NULL AND btrim(u."department") <> ''
  ) c
  ORDER BY lower(c.dept), c.dept
) d
ON CONFLICT ("name") DO NOTHING;

-- Point every user at their department.
UPDATE "User" u
SET "departmentId" = dep."id"
FROM (
  SELECT u2."id" AS user_id, CASE
    WHEN lower(btrim(u2."department")) IN
      ('ops. director', 'ops director', 'operations', 'office manager', 'office management')
      THEN 'Operations'
    WHEN lower(btrim(u2."department")) LIKE 'global admission%'
      THEN 'Global Admissions'
    ELSE btrim(u2."department")
  END AS dept
  FROM "User" u2
  WHERE u2."department" IS NOT NULL AND btrim(u2."department") <> ''
) m
JOIN "Department" dep ON lower(dep."name") = lower(m.dept)
WHERE u."id" = m.user_id AND u."departmentId" IS NULL;

-- The department leads: the people expected at Monday meetings and expected to
-- submit weekly/monthly goals. Shakhzod (ops director) ranks equal to a
-- department lead. Everyone else keeps the MEMBER default. Emails absent from
-- a database are simply skipped, so this is safe on dev data too.
UPDATE "User"
SET "role" = 'LEAD'
WHERE lower(coalesce("email", '')) IN (
  'banu@freshman.academy',       -- Sales
  'gulrukh@freshman.academy',    -- Advanced English
  'khusanboy@freshman.academy',  -- Imkon Scholars
  'malika@freshman.academy',     -- Freshman Scholars
  'nigel@freshman.academy',      -- Research Institute
  'apclasses@freshman.academy',  -- AP
  'tech@freshman.academy',       -- Tech
  'sanjar@freshman.academy',     -- Full Support
  'sega@freshman.academy',       -- Admissions Program
  'classes@freshman.academy',    -- SAT
  'valera@freshman.academy',     -- Master's Program
  'shakhzod@freshman.academy'    -- Operations (Ops. Director)
);

-- The free-text column has served its purpose.
ALTER TABLE "User" DROP COLUMN IF EXISTS "department";
