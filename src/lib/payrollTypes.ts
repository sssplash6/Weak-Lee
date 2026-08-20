// Client-safe payroll vocabulary. Mirrors the Prisma `PayrollStatus` and
// `PayrollMethod` enums (the lib/penalties.ts pattern) and holds the shared
// arithmetic and upload limits, so the form previews with exactly the numbers
// the server action then stores. All money is whole-dollar USD app-wide.

/**
 * Payroll is closed: every route under /payroll shows the coming-soon screen
 * instead of its content (employees and both reviewer stages alike), the lazy
 * sweeps stay quiet so nothing expires or emails a reminder while it's shut,
 * and every action refuses. Rows already in the database are left exactly as
 * they are — flipping this to `false` reopens the feature mid-flight.
 */
export const PAYROLL_CLOSED = true;

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

/** Safely read a Prisma Json column back into the details shape. */
export function parsePaymentDetails(v: unknown): PaymentDetails {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  return {
    cardNumber: typeof o.cardNumber === "string" ? o.cardNumber : undefined,
    cardHolder: typeof o.cardHolder === "string" ? o.cardHolder : undefined,
    wiseEmail: typeof o.wiseEmail === "string" ? o.wiseEmail : undefined,
  };
}

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

/** The unmasked form, for the people who actually move the money:
 * "UzCard · 8600 1234 1234 1234 · NAME", "Wise · a@b.c", or "Cash". */
export function paymentFull(
  method: PayrollMethod,
  details: PaymentDetails,
): string {
  if (method === "UZCARD") {
    const grouped = (details.cardNumber ?? "")
      .replace(/\D/g, "")
      .replace(/(.{4})/g, "$1 ")
      .trim();
    return ["UzCard", grouped, details.cardHolder].filter(Boolean).join(" · ");
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

/** Status pill classes — semantic tokens flip for dark; raw hues follow the
 * app's existing chip convention (policy cards, notices). */
export const PAYROLL_STATUS_BADGE: Record<PayrollStatus, string> = {
  DRAFT: "bg-canvas text-muted-fg",
  SUBMITTED: "bg-brand-soft text-brand",
  DECLINED: "bg-red-50 text-red-700",
  EXPIRED: "bg-canvas text-muted-fg",
  APPROVED_BY_ADMIN: "bg-accent-soft text-accent-ink",
  PROCESSED: "bg-green-50 text-green-700",
};

/** One audit-trail row's verb, disambiguated by where it came from. */
export function payrollEventLabel(
  from: PayrollStatus | null,
  to: PayrollStatus,
): string {
  if (to === "SUBMITTED") {
    if (from === "DECLINED") return "Resubmitted";
    if (from === "APPROVED_BY_ADMIN") return "Sent back by finance";
    return "Filed";
  }
  if (to === "DECLINED") return "Declined";
  if (to === "APPROVED_BY_ADMIN") return "Approved — sent to finance";
  if (to === "PROCESSED") return "Paid out";
  if (to === "EXPIRED") return "Expired — resubmit window lapsed";
  return PAYROLL_STATUS_LABEL[to];
}

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
