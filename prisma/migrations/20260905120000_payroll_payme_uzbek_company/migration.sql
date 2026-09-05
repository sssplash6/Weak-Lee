-- Payme and Uzbek Company as payout sources.
--
-- Finance settles payroll through four sources now: Cash Uzbekistan, Payme,
-- Uzbek Company and Wise. Two of those already exist in this enum
-- (CASH_UZBEKISTAN, WISE_USD — relabelled "Wise" in the UI); these are the
-- other two.
--
-- NOTHING IS REMOVED. The sources being dropped from the form (Cash Singapore,
-- Uzbek card, Visa card, Stripe, SG Cash, SG Bank, Kapital Bank, Various) stay
-- in the type because rows filed under them exist, and a request that was paid
-- has to keep saying how. Which sources may be CHOSEN is decided in code —
-- PAYROLL_METHODS_OFFERED in lib/payrollTypes.ts, enforced by the submit
-- action — so retiring a source needs no migration and rewrites no history.
--
-- Hand-written and idempotent: IF NOT EXISTS makes a re-run a no-op, and the
-- values are appended next to the other Uzbek sources so the type's order
-- matches the order schema.prisma lists them in.

ALTER TYPE "PayrollMethod" ADD VALUE IF NOT EXISTS 'PAYME' AFTER 'CASH_UZBEKISTAN';
ALTER TYPE "PayrollMethod" ADD VALUE IF NOT EXISTS 'UZBEK_COMPANY' AFTER 'PAYME';
