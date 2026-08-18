-- One person, several departments. The single User.departmentId + User.role
-- pair becomes a DepartmentMembership join table with the role ON THE
-- MEMBERSHIP, so someone can lead one department while sitting as a plain
-- member of another. Existing assignments are carried over 1:1, then the two
-- User columns are dropped. Hand-written and guarded/idempotent throughout —
-- Prisma applies statements in autocommit, so a retry after a mid-file
-- failure must run cleanly over partial state.

-- CreateTable
CREATE TABLE IF NOT EXISTS "DepartmentMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepartmentMembership_departmentId_idx" ON "DepartmentMembership"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentMembership_userId_departmentId_key" ON "DepartmentMembership"("userId", "departmentId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DepartmentMembership" ADD CONSTRAINT "DepartmentMembership_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------- backfill

-- Carry every existing assignment over as one membership, keeping the role.
-- Deterministic ids (md5 of the pair) + ON CONFLICT make a retry a no-op.
INSERT INTO "DepartmentMembership" ("id", "userId", "departmentId", "role")
SELECT md5(u."id" || u."departmentId"), u."id", u."departmentId", u."role"
FROM "User" u
WHERE u."departmentId" IS NOT NULL
ON CONFLICT ("userId", "departmentId") DO NOTHING;

-- Umid's old free-text department was "Global Admission / Tech" — the slash
-- meant two seats, which the single-department model couldn't hold. Now it
-- can: add his Tech membership alongside the Global Admissions one the
-- previous migration kept. No-op wherever that user or department is absent.
INSERT INTO "DepartmentMembership" ("id", "userId", "departmentId", "role")
SELECT md5(u."id" || d."id"), u."id", d."id", 'MEMBER'
FROM "User" u
JOIN "Department" d ON d."name" = 'Tech'
WHERE lower(coalesce(u."email", '')) = 'umidbek@freshman.academy'
ON CONFLICT ("userId", "departmentId") DO NOTHING;

-- The single-department columns have served their purpose. (Dropping
-- departmentId takes its FK and index down with it.)
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
ALTER TABLE "User" DROP COLUMN IF EXISTS "departmentId";
