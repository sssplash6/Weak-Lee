-- A Visa card as its own payout method.
--
-- "UZS card" already existed for a local Uzbek card; an international Visa is
-- paid a different way (it can carry bank routing alongside the card), and the
-- form now asks for a different set of fields per method — see paymentFieldsFor
-- in lib/payrollTypes.ts. The details themselves live in the existing
-- paymentDetails Json column, so nothing else changes shape.
--
-- Hand-written and idempotent. IF NOT EXISTS makes a re-run a no-op; the value
-- is appended after UZS_CARD so the dropdown keeps the two card methods together.

ALTER TYPE "PayrollMethod" ADD VALUE IF NOT EXISTS 'VISA_CARD' AFTER 'UZS_CARD';
