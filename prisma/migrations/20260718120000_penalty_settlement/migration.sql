-- Per-fine settlement. A fine is now "active" (outstanding) until `paidAt` is
-- set — recorded when it's cut from the person's salary and marked paid — after
-- which it moves to the archive. This replaces the coarse User.finesPaid
-- running-total, which is migrated below and then dropped.

-- AlterTable
ALTER TABLE "Penalty" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Penalty" ADD COLUMN "settledById" TEXT;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from the old running-total model: settle each user's oldest fines,
-- in order, for as long as the cumulative amount stays within what they'd
-- already paid back (User.finesPaid). Fines beyond that stay outstanding.
UPDATE "Penalty" p
SET "paidAt" = CURRENT_TIMESTAMP
FROM (
  SELECT
    "id",
    "userId",
    SUM("amount") OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt", "id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative
  FROM "Penalty"
) r
JOIN "User" u ON u."id" = r."userId"
WHERE p."id" = r."id"
  AND u."finesPaid" > 0
  AND r.cumulative <= u."finesPaid";

-- DropColumn (superseded by the per-fine paidAt above)
ALTER TABLE "User" DROP COLUMN "finesPaid";
