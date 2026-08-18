-- Monthly payroll: pay-request filing and two-stage approval (admin → finance).
-- New: PayrollPeriod / PayrollSubmission + snapshot lines / expenses + receipts
-- / generated PDFs / append-only PayrollEvent audit log. Existing tables gain
-- payroll hooks: FinePayment.source (payroll deductions reuse the settlement
-- ledger), Bonus.payrollSubmissionId (a paid-out bonus can't pay out twice),
-- and a PAYROLL notification type. Guarded/idempotent like every hand-written
-- migration here (statements run in autocommit).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'DECLINED', 'EXPIRED', 'APPROVED_BY_ADMIN', 'PROCESSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PayrollMethod" AS ENUM ('CASH', 'UZCARD', 'WISE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FinePaymentSource" AS ENUM ('MANUAL', 'PAYROLL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYROLL';

-- AlterTable
ALTER TABLE "FinePayment" ADD COLUMN IF NOT EXISTS "source" "FinePaymentSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Bonus" ADD COLUMN IF NOT EXISTS "payrollSubmissionId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "filingClosesAt" TIMESTAMP(3) NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPeriod_year_month_key" ON "PayrollPeriod"("year", "month");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "baseSalary" INTEGER NOT NULL,
    "bonusesTotal" INTEGER NOT NULL DEFAULT 0,
    "finesTotal" INTEGER NOT NULL DEFAULT 0,
    "expensesTotal" INTEGER NOT NULL DEFAULT 0,
    "netTotal" INTEGER NOT NULL,
    "paymentMethod" "PayrollMethod" NOT NULL,
    "paymentDetails" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "lastSubmittedAt" TIMESTAMP(3),
    "resubmitDeadline" TIMESTAMP(3),
    "graceDayUsed" BOOLEAN NOT NULL DEFAULT false,
    "fineBatchId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSubmission_userId_periodId_key" ON "PayrollSubmission"("userId", "periodId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollSubmission_periodId_status_idx" ON "PayrollSubmission"("periodId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollSubmission_userId_status_idx" ON "PayrollSubmission"("userId", "status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollBonusLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "bonusId" TEXT,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollBonusLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollBonusLine_submissionId_idx" ON "PayrollBonusLine"("submissionId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollFineLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "penaltyId" TEXT,
    "amount" INTEGER NOT NULL,
    "type" "PenaltyType" NOT NULL,
    "note" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollFineLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollFineLine_submissionId_idx" ON "PayrollFineLine"("submissionId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollExpense" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PayrollExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollExpense_submissionId_idx" ON "PayrollExpense"("submissionId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollReceipt" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollReceipt_expenseId_key" ON "PayrollReceipt"("expenseId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollPdf" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPdf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPdf_submissionId_key" ON "PayrollPdf"("submissionId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "PayrollEvent" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" "PayrollStatus",
    "toStatus" "PayrollStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayrollEvent_submissionId_createdAt_idx" ON "PayrollEvent"("submissionId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_payrollSubmissionId_fkey"
    FOREIGN KEY ("payrollSubmissionId") REFERENCES "PayrollSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollSubmission" ADD CONSTRAINT "PayrollSubmission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollSubmission" ADD CONSTRAINT "PayrollSubmission_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollBonusLine" ADD CONSTRAINT "PayrollBonusLine_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "PayrollSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollBonusLine" ADD CONSTRAINT "PayrollBonusLine_bonusId_fkey"
    FOREIGN KEY ("bonusId") REFERENCES "Bonus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollFineLine" ADD CONSTRAINT "PayrollFineLine_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "PayrollSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollFineLine" ADD CONSTRAINT "PayrollFineLine_penaltyId_fkey"
    FOREIGN KEY ("penaltyId") REFERENCES "Penalty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollExpense" ADD CONSTRAINT "PayrollExpense_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "PayrollSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollReceipt" ADD CONSTRAINT "PayrollReceipt_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "PayrollExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollPdf" ADD CONSTRAINT "PayrollPdf_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "PayrollSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "PayrollSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PayrollEvent" ADD CONSTRAINT "PayrollEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
