// Client-safe payroll vocabulary. Mirrors the Prisma `PayrollStatus` and
// `PayrollMethod` enums (the lib/penalties.ts pattern) and holds the shared
// arithmetic and upload limits, so the form previews with exactly the numbers
// the server action then stores. All money is whole-dollar USD app-wide.

/**
 * The kill switch for the whole payroll feature. While true every route under
 * /payroll shows the coming-soon screen (employees and both reviewer stages
 * alike), the lazy sweeps stay quiet so nothing expires or emails a reminder,
 * and every action refuses. Rows in the database are untouched either way, so
 * this can be flipped in both directions mid-flight — set it back to `true` to
 * shut the feature off again without losing anything.
 */
export const PAYROLL_CLOSED = false;

/**
 * Restricted rollout. While this list is non-empty, payroll is open ONLY to
 * these accounts; every other account sees exactly what the kill switch shows.
 * Empty the list to open payroll to the whole team again.
 *
 * This is deliberately a second, narrower switch rather than a change to
 * PAYROLL_CLOSED: the kill switch answers "is the feature on at all", this
 * answers "who can reach it yet", and a soft launch needs both to be true.
 * Everything keys off the same helper below — routes, server actions, the PDF
 * and receipt routes, and the two lazy sweeps — so there is no surface where
 * the list is enforced in one place and forgotten in another.
 */
export const PAYROLL_OPEN_TO: readonly string[] = ["tech@freshman.academy"];

/**
 * Whether payroll is available to this account. The kill switch wins over the
 * allowlist, and an empty allowlist means everyone.
 */
export function isPayrollOpenFor(email: string | null | undefined): boolean {
  if (PAYROLL_CLOSED) return false;
  if (PAYROLL_OPEN_TO.length === 0) return true;
  return !!email && PAYROLL_OPEN_TO.includes(email.toLowerCase());
}

/**
 * Whether this account is testing a restricted rollout, as opposed to simply
 * being allowed to use a fully-open payroll. Only true while the allowlist is
 * in force — emptying it (full launch) makes this false for everyone, so no
 * exception granted to a tester can outlive the rollout it was granted for.
 */
export function isPayrollRolloutTester(email: string | null | undefined): boolean {
  return PAYROLL_OPEN_TO.length > 0 && isPayrollOpenFor(email);
}

/** The allowlist, lowercased — for the sweeps, which work in bulk. */
export function payrollOpenToEmails(): string[] {
  return PAYROLL_OPEN_TO.map((e) => e.toLowerCase());
}

export type PayrollStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "DECLINED"
  | "EXPIRED"
  | "APPROVED_BY_ADMIN"
  | "PROCESSED";

/**
 * How someone is paid. These mirror the "Source" column of the finance team's
 * accounting sheet one-for-one, so a filed row reconciles against that sheet
 * without translation.
 */
export type PayrollMethod =
  | "CASH_SINGAPORE"
  | "CASH_UZBEKISTAN"
  | "WISE_USD"
  | "UZS_CARD"
  | "STRIPE"
  | "SG_CASH"
  | "SG_BANK"
  | "KAPITAL_BANK"
  | "VARIOUS";

/** Every method, in the order the accounting sheet lists them. */
export const PAYROLL_METHODS: PayrollMethod[] = [
  "CASH_SINGAPORE",
  "CASH_UZBEKISTAN",
  "WISE_USD",
  "UZS_CARD",
  "STRIPE",
  "SG_CASH",
  "SG_BANK",
  "KAPITAL_BANK",
  "VARIOUS",
];

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
  CASH_SINGAPORE: "Cash Singapore",
  CASH_UZBEKISTAN: "Cash Uzbekistan",
  WISE_USD: "Wise USD",
  UZS_CARD: "UZS card",
  STRIPE: "Stripe",
  SG_CASH: "SG Cash",
  SG_BANK: "SG Bank",
  KAPITAL_BANK: "Kapital Bank",
  VARIOUS: "Various",
};

/** True for a value the enum actually holds — use on anything caller-supplied. */
export function isPayrollMethod(v: unknown): v is PayrollMethod {
  return typeof v === "string" && (PAYROLL_METHODS as string[]).includes(v);
}

/**
 * The one method that needs something typed alongside it. Everything else is
 * either cash or is arranged with finance directly, so the app holds no
 * account or card number for it.
 */
export function methodNeedsWiseEmail(method: PayrollMethod): boolean {
  return method === "WISE_USD";
}

/** Whether this method is paid in physical cash — nothing else to collect. */
export function methodIsCash(method: PayrollMethod): boolean {
  return (
    method === "CASH_SINGAPORE" ||
    method === "CASH_UZBEKISTAN" ||
    method === "SG_CASH"
  );
}

/**
 * What the chosen payment method stores in `paymentDetails`: WISE_USD the
 * account email, every other method nothing. A card or account number is
 * deliberately absent — those details are arranged with finance over Telegram,
 * so the app never holds one. Rows written before that decision may still
 * carry card keys; nothing reads them.
 */
export type PaymentDetails = {
  wiseEmail?: string;
};

/** Safely read a Prisma Json column back into the details shape. */
export function parsePaymentDetails(v: unknown): PaymentDetails {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  return {
    wiseEmail: typeof o.wiseEmail === "string" ? o.wiseEmail : undefined,
  };
}

/**
 * How this person gets paid, in one line: "UZS card", "Wise USD · a@b.c",
 * "Cash Singapore" — the sheet's own wording, plus the Wise address when
 * there is one.
 *
 * There is no masked/unmasked pair any more. There used to be, because the
 * card method stored a card number and finance needed to see all of it; now
 * those details are settled over Telegram and there is nothing here to hide.
 */
export function paymentSummary(
  method: PayrollMethod,
  details: PaymentDetails,
): string {
  const label = PAYROLL_METHOD_LABEL[method];
  if (methodNeedsWiseEmail(method)) {
    return [label, details.wiseEmail].filter(Boolean).join(" · ");
  }
  return label;
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
    if (from === "SUBMITTED") return "Edited and resent";
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
