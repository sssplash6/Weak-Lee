// Client-safe payroll vocabulary. Mirrors the Prisma `PayrollStatus` and
// `PayrollMethod` enums (the lib/penalties.ts pattern) and holds the shared
// arithmetic and upload limits, so the form previews with exactly the numbers
// the server action then stores. All money is whole-dollar USD app-wide.

export type PayrollStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "DECLINED"
  | "EXPIRED"
  | "APPROVED_BY_ADMIN"
  | "PROCESSED";

export type PayrollMethod = "CASH" | "UZCARD" | "WISE";

/** How each status reads in the UI — phrased for the employee's point of view. */
export const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting review",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  APPROVED_BY_ADMIN: "With finance",
  PROCESSED: "Paid",
};

export const PAYROLL_METHOD_LABEL: Record<PayrollMethod, string> = {
  CASH: "Cash",
  UZCARD: "UzCard",
  WISE: "Wise",
};

/**
 * What the chosen payment method stores in `paymentDetails`. Exactly one shape
 * per method: UZCARD carries the card, WISE the account email, CASH nothing.
 */
export type PaymentDetails = {
  cardNumber?: string;
  cardHolder?: string;
  wiseEmail?: string;
};

/** One line: "UzCard · 8600 …1234 · NAME", "Wise · a@b.c", or "Cash". */
export function paymentSummary(
  method: PayrollMethod,
  details: PaymentDetails,
): string {
  if (method === "UZCARD") {
    const digits = (details.cardNumber ?? "").replace(/\D/g, "");
    const tail = digits.length >= 4 ? `…${digits.slice(-4)}` : "";
    return ["UzCard", tail, details.cardHolder].filter(Boolean).join(" · ");
  }
  if (method === "WISE") {
    return ["Wise", details.wiseEmail].filter(Boolean).join(" · ");
  }
  return "Cash";
}

/** The one formula: base + bonuses − fines + expenses. Shown, not just stored. */
export function computeNet(t: {
  baseSalary: number;
  bonusesTotal: number;
  finesTotal: number;
  expensesTotal: number;
}): number {
  return t.baseSalary + t.bonusesTotal - t.finesTotal + t.expensesTotal;
}

/** Guard rail so a typo can't file an absurd amount (mirrors MAX_PENALTY). */
export const MAX_PAYROLL_AMOUNT = 100_000_000;

/** Expense line items per submission — plenty for "miscellaneous". */
export const MAX_PAYROLL_EXPENSES = 15;

/** Receipt upload caps. The server action re-checks both (the client hint is
 * courtesy, not enforcement); next.config.ts raises the action body limit to
 * fit a submission's worth of receipts. */
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024; // 4MB per file
export const RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** (2026, 8) → "August 2026". `month` is 1-based, as stored on PayrollPeriod. */
export function payrollPeriodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** (2026, 8) → "August" — for copy where the year is obvious. */
export function payrollMonthName(month: number): string {
  return MONTH_NAMES[month - 1];
}
