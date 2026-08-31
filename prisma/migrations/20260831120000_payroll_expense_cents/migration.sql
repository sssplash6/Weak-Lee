-- Expenses carry cents; the payout rounds once at the end.
--
-- A self-reported expense is a real receipt — $1.95 for a tool subscription —
-- and the form used to drop anything that wasn't a whole dollar. Storing cents
-- keeps the line honest; PayrollSubmission.netTotal stays whole-dollar Int
-- because it is what actually gets paid, rounded half-up from the exact sum
-- (computeNet in lib/payrollTypes.ts).
--
-- Units are in the names, matching amountSgdCents / wiseFeeCents above.
-- Existing rows are whole dollars, so they scale by 100 exactly.
--
-- Hand-written and idempotent: the rename guards make a re-run a no-op, so the
-- multiply can never be applied twice.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PayrollExpense' AND column_name = 'amount'
  ) THEN
    ALTER TABLE "PayrollExpense" RENAME COLUMN "amount" TO "amountCents";
    UPDATE "PayrollExpense" SET "amountCents" = "amountCents" * 100;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PayrollSubmission' AND column_name = 'expensesTotal'
  ) THEN
    ALTER TABLE "PayrollSubmission" RENAME COLUMN "expensesTotal" TO "expensesTotalCents";
    UPDATE "PayrollSubmission" SET "expensesTotalCents" = "expensesTotalCents" * 100;
  END IF;
END $$;
