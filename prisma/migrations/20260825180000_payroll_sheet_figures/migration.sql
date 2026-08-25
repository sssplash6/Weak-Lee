-- The payout figures finance records on /payroll/sheet.
--
-- The app already knows the USD arithmetic (salary, bonus, penalty, net); it
-- does not know what actually left which account. These three columns mirror
-- the accounting sheet's own Amount (UZS) / Amount (SGD) / Wise Fee columns so
-- the register lives in one place instead of two.
--
-- All nullable: null means "not recorded yet", which is deliberately distinct
-- from a recorded zero. Units are in the column names — UZS is whole som,
-- SGD and the Wise fee are cents, because the sheet carries cents there and
-- every other money column in this schema is whole-dollar Int.
--
-- Hand-written and idempotent (Prisma applies statements in autocommit).

ALTER TABLE "PayrollSubmission" ADD COLUMN IF NOT EXISTS "amountUzs" INTEGER;
ALTER TABLE "PayrollSubmission" ADD COLUMN IF NOT EXISTS "amountSgdCents" INTEGER;
ALTER TABLE "PayrollSubmission" ADD COLUMN IF NOT EXISTS "wiseFeeCents" INTEGER;
