-- Part-settlement of fines. A settlement is no longer all-or-nothing per fine:
-- an admin records whatever was cut from a salary and it's applied oldest-first,
-- so a fine can be part-paid. `Penalty.paidAmount` carries the running total per
-- fine, and every movement of money is itemised in the new FinePayment ledger.

-- AlterTable
ALTER TABLE "Penalty" ADD COLUMN     "paidAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FinePayment" (
    "id" TEXT NOT NULL,
    "penaltyId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "batchId" TEXT NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinePayment_penaltyId_idx" ON "FinePayment"("penaltyId");

-- CreateIndex
CREATE INDEX "FinePayment_batchId_idx" ON "FinePayment"("batchId");

-- AddForeignKey
ALTER TABLE "FinePayment" ADD CONSTRAINT "FinePayment_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinePayment" ADD CONSTRAINT "FinePayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every fine already settled was settled in full, so its paidAmount
-- is its amount.
UPDATE "Penalty" SET "paidAmount" = "amount" WHERE "paidAt" IS NOT NULL;

-- …and give each one a matching ledger entry, so the payment history starts out
-- complete rather than empty for everything settled before this migration. Each
-- gets its own batch: they were recorded one fine at a time.
INSERT INTO "FinePayment" ("id", "penaltyId", "amount", "batchId", "recordedById", "createdAt")
SELECT
  gen_random_uuid()::text,
  p."id",
  p."amount",
  gen_random_uuid()::text,
  p."settledById",
  p."paidAt"
FROM "Penalty" p
WHERE p."paidAt" IS NOT NULL;
