-- PayrollMethod becomes the finance team's "Source" vocabulary.
--
-- The old three values (CASH / UZCARD / WISE) are replaced by the nine the
-- accounting sheet uses, so a filed row reconciles against that sheet without
-- translation. Existing rows are carried onto their equivalent:
--
--   CASH   → CASH_UZBEKISTAN   (the team is Tashkent-based; SG cash is its own
--                               value now and was never what CASH meant)
--   UZCARD → UZS_CARD
--   WISE   → WISE_USD
--
-- Postgres can't drop a value from an enum in place, so this builds the new
-- type and swaps the column onto it. Wrapped in one guarded DO block: the
-- whole swap is a single implicit transaction (safe against Prisma's
-- autocommit), and the guard makes a re-run over already-migrated state a
-- no-op instead of an error.

DO $$
BEGIN
  -- Only act while the column still carries the old shape.
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'PayrollMethod' AND e.enumlabel = 'CASH'
  ) THEN
    CREATE TYPE "PayrollMethod_new" AS ENUM (
      'CASH_SINGAPORE',
      'CASH_UZBEKISTAN',
      'WISE_USD',
      'UZS_CARD',
      'STRIPE',
      'SG_CASH',
      'SG_BANK',
      'KAPITAL_BANK',
      'VARIOUS'
    );

    ALTER TABLE "PayrollSubmission"
      ALTER COLUMN "paymentMethod" TYPE "PayrollMethod_new"
      USING (
        CASE "paymentMethod"::text
          WHEN 'CASH'   THEN 'CASH_UZBEKISTAN'
          WHEN 'UZCARD' THEN 'UZS_CARD'
          WHEN 'WISE'   THEN 'WISE_USD'
        END
      )::"PayrollMethod_new";

    DROP TYPE "PayrollMethod";
    ALTER TYPE "PayrollMethod_new" RENAME TO "PayrollMethod";
  END IF;
END $$;
