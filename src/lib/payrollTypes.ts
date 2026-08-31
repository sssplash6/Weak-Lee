// Client-safe payroll vocabulary. Mirrors the Prisma `PayrollStatus` and
// `PayrollMethod` enums (the lib/penalties.ts pattern) and holds the shared
// arithmetic and upload limits, so the form previews with exactly the numbers
// the server action then stores.
//
// Money is whole-dollar USD app-wide, with ONE exception: self-reported
// expenses are cents, because that is what a receipt says. They are summed
// exactly and the payout rounds half-up once, at the net — see computeNet.

import { formatMoney } from "@/lib/penalties";

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
export const PAYROLL_OPEN_TO: readonly string[] = [];

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

/**
 * APPROVED_BY_ADMIN is legacy and nothing enters it any more: it was the admin
 * stage's hand-off to finance, and payroll has one reviewer stage now. The
 * value stays because rows and audit events still hold it, and a row left in
 * it is still unpaid money — the panel queues it beside SUBMITTED.
 */
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
  | "VISA_CARD"
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
  "VISA_CARD",
  "STRIPE",
  "SG_CASH",
  "SG_BANK",
  "KAPITAL_BANK",
  "VARIOUS",
];

/** How each status reads in the UI — phrased for the employee's point of view. */
export const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "With finance",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  // Legacy — the same desk as SUBMITTED, kept distinguishable in the panel's
  // status filter and in anyone's memory of where the row came from.
  APPROVED_BY_ADMIN: "With finance · approved",
  PROCESSED: "Paid",
};

export const PAYROLL_METHOD_LABEL: Record<PayrollMethod, string> = {
  CASH_SINGAPORE: "Cash Singapore",
  CASH_UZBEKISTAN: "Cash Uzbekistan",
  WISE_USD: "Wise USD",
  UZS_CARD: "Uzbek card",
  VISA_CARD: "Visa card",
  STRIPE: "Stripe",
  SG_CASH: "SG Cash",
  SG_BANK: "SG Bank",
  KAPITAL_BANK: "Kapital Bank",
  // The catch-all. It is "Various" in the finance sheet's Source column — the
  // enum value still says so — but the person filing is describing one payment
  // they want made a way that isn't listed, and "Other" is what that reads as.
  VARIOUS: "Other",
};

/** True for a value the enum actually holds — use on anything caller-supplied. */
export function isPayrollMethod(v: unknown): v is PayrollMethod {
  return typeof v === "string" && (PAYROLL_METHODS as string[]).includes(v);
}

/**
 * The one method that needs an email typed alongside it. Cards and bank
 * transfers ask for their own fields — see paymentFieldsFor.
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
 * What the chosen payment method stores in `paymentDetails`.
 *
 * These are payout instructions, entered by the person being paid, so finance
 * can send the money without a side conversation. Card numbers used to be kept
 * out of the app deliberately; they are here now because the team asked to
 * collect them, and two rules keep that decision contained:
 *   • the emailed invoice PDF carries a MASKED number (last four only) — the
 *     PDF goes out through a third-party mail provider, and that is exactly
 *     what the old rule was protecting against;
 *   • full numbers are shown only in the app, to the filer and to finance.
 */
export type PaymentDetails = {
  wiseEmail?: string;
  cardHolder?: string;
  cardNumber?: string;
  cardExpiry?: string;
  bankName?: string;
  accountNumber?: string;
  bankCode?: string;
  swift?: string;
  otherDetails?: string;
};

export type PaymentFieldKey = keyof PaymentDetails;

export type PaymentField = {
  key: PaymentFieldKey;
  label: string;
  placeholder: string;
  maxLength: number;
  /** Blocks filing when empty. Optional ones are still asked for, never demanded. */
  required: boolean;
  /** Drives the input type, the validation, and whether the PDF masks it. */
  kind: "email" | "card" | "expiry" | "text" | "note";
};

const FIELDS: Record<PaymentFieldKey, PaymentField> = {
  wiseEmail: {
    key: "wiseEmail",
    label: "Wise account email",
    placeholder: "you@example.com",
    maxLength: 200,
    required: true,
    kind: "email",
  },
  cardHolder: {
    key: "cardHolder",
    label: "Cardholder name",
    placeholder: "As printed on the card",
    maxLength: 120,
    required: true,
    kind: "text",
  },
  cardNumber: {
    key: "cardNumber",
    label: "Card number",
    placeholder: "8600 1234 5678 9012",
    maxLength: 30,
    required: true,
    kind: "card",
  },
  cardExpiry: {
    key: "cardExpiry",
    label: "Expires",
    placeholder: "MM/YY",
    maxLength: 7,
    required: true,
    kind: "expiry",
  },
  // Bank routing is asked for but never demanded: a filing window is four days
  // long, and nobody should miss it hunting for a branch code. Finance gets
  // whatever is known, and asks for the rest only if a transfer needs it.
  bankName: {
    key: "bankName",
    label: "Bank",
    placeholder: "Bank name (optional)",
    maxLength: 120,
    required: false,
    kind: "text",
  },
  accountNumber: {
    key: "accountNumber",
    label: "Account number",
    placeholder: "Account or IBAN (optional)",
    maxLength: 64,
    required: false,
    kind: "text",
  },
  bankCode: {
    key: "bankCode",
    label: "Bank code",
    placeholder: "Branch / routing code (optional)",
    maxLength: 32,
    required: false,
    kind: "text",
  },
  swift: {
    key: "swift",
    label: "SWIFT / BIC",
    placeholder: "e.g. ABCDUZ22 (optional)",
    maxLength: 16,
    required: false,
    kind: "text",
  },
  otherDetails: {
    key: "otherDetails",
    label: "How to pay you",
    placeholder: "Describe the method and everything finance needs to send it",
    maxLength: 500,
    required: true,
    kind: "note",
  },
};

/**
 * What to ask for, given the method. ONE table — the form renders it, the
 * server validates against it, and the invoice reads it back, so a new field
 * can never appear on the form and go unstored (or be demanded by a validator
 * nothing displays).
 */
export function paymentFieldsFor(method: PayrollMethod): PaymentField[] {
  switch (method) {
    case "WISE_USD":
      return [FIELDS.wiseEmail];
    // Both are a local card in hand: Kapital Bank pays onto one, so it needs
    // exactly what the Uzbek card method needs and nothing more.
    case "UZS_CARD":
    case "KAPITAL_BANK":
      return [FIELDS.cardHolder, FIELDS.cardNumber, FIELDS.cardExpiry];
    case "VISA_CARD":
      return [
        FIELDS.cardHolder,
        FIELDS.cardNumber,
        FIELDS.cardExpiry,
        FIELDS.bankName,
        FIELDS.accountNumber,
        FIELDS.bankCode,
        FIELDS.swift,
      ];
    case "VARIOUS":
      return [FIELDS.otherDetails];
    default:
      // Cash, Stripe, SG Bank — settled off-app as they always were.
      return [];
  }
}

/** Digits only, for length checks and for masking. */
function cardDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/**
 * A card number as finance should see it outside the app: last four only.
 * "8600123456789012" → "•••• 9012". Anything too short to have a meaningful
 * tail is masked whole.
 */
export function maskCardNumber(raw: string): string {
  const digits = cardDigits(raw);
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

/**
 * The first thing wrong with the details for this method, phrased for the
 * person filing — or null when they're good. Shared by the form and the server
 * action so the message is the same wherever it's hit.
 */
export function validatePaymentDetails(
  method: PayrollMethod,
  details: PaymentDetails,
): string | null {
  for (const f of paymentFieldsFor(method)) {
    const value = (details[f.key] ?? "").trim();
    if (!value) {
      if (f.required) return `${f.label} is required for ${PAYROLL_METHOD_LABEL[method]}.`;
      continue;
    }
    if (f.kind === "email" && !/^\S+@\S+\.\S+$/.test(value)) {
      return "Enter a valid Wise account email.";
    }
    if (f.kind === "card") {
      const digits = cardDigits(value);
      // Spaces and dashes are how people write a card down; the range covers
      // Uzcard/Humo (16) through the longest international PANs (19).
      if (digits.length < 12 || digits.length > 19 || !/^[0-9 -]+$/.test(value)) {
        return "Enter the full card number (digits only, spaces are fine).";
      }
    }
    if (f.kind === "expiry") {
      const m = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/.exec(value);
      if (!m) return "Enter the card expiry as MM/YY.";
    }
  }
  return null;
}

/** Safely read a Prisma Json column back into the details shape. */
export function parsePaymentDetails(v: unknown): PaymentDetails {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: PaymentDetails = {};
  for (const key of Object.keys(FIELDS) as PaymentFieldKey[]) {
    const raw = o[key];
    if (typeof raw === "string" && raw.trim()) out[key] = raw;
  }
  return out;
}

/**
 * The payout instructions as labelled lines, in the order they were asked for:
 * what the reviewer reads off the screen, and what the invoice prints.
 *
 * `mask` swaps the card number for its last four. The PDF passes it, because
 * that file is emailed; the in-app views don't, because finance has to type
 * the number somewhere to make the payment.
 */
export function paymentDetailLines(
  method: PayrollMethod,
  details: PaymentDetails,
  opts: { mask?: boolean } = {},
): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  for (const f of paymentFieldsFor(method)) {
    const value = (details[f.key] ?? "").trim();
    if (!value) continue;
    lines.push({
      label: f.label,
      value: opts.mask && f.kind === "card" ? maskCardNumber(value) : value,
    });
  }
  return lines;
}

/**
 * How this person gets paid, in one line: "Uzbek card · •••• 9012",
 * "Wise USD · a@b.c", "Cash Singapore" — the sheet's own wording plus the one
 * identifying detail. Always masked: this is a summary for lists and headers,
 * and the full number is a click away in the details below it.
 */
export function paymentSummary(
  method: PayrollMethod,
  details: PaymentDetails,
): string {
  const label = PAYROLL_METHOD_LABEL[method];
  if (details.wiseEmail) return `${label} · ${details.wiseEmail}`;
  if (details.cardNumber) return `${label} · ${maskCardNumber(details.cardNumber)}`;
  return label;
}

/**
 * The pay arithmetic. Base, bonuses and fines are whole dollars; expenses are
 * cents, because that's what a receipt says ($1.95 for a tool subscription).
 */
export type PayrollTotals = {
  baseSalary: number;
  bonusesTotal: number;
  finesTotal: number;
  expensesTotalCents: number;
};

/** The exact total in cents, before anything is rounded. */
export function netTotalCents(t: PayrollTotals): number {
  return (
    (t.baseSalary + t.bonusesTotal - t.finesTotal) * 100 + t.expensesTotalCents
  );
}

/**
 * The one formula: base + bonuses − fines + expenses, rounded half-up to whole
 * dollars — $600.95 is paid as $601, $1001.4 as $1001.
 *
 * The rounding happens HERE and nowhere else. Rounding each expense on the way
 * in would restate what someone spent (and drop anything under 50¢ entirely);
 * rounding the sum once moves the payout by at most half a dollar, and every
 * line still reads back exactly as it was filed.
 */
export function computeNet(t: PayrollTotals): number {
  return Math.round(netTotalCents(t) / 100);
}

/**
 * The cents the final rounding added or shaved — 0 when the total was already
 * whole. Shown as its own line wherever the breakdown is displayed, so the
 * figures visibly add up instead of missing by a few cents.
 */
export function roundingCents(t: PayrollTotals): number {
  return computeNet(t) * 100 - netTotalCents(t);
}

/**
 * The breakdown every surface shows — the form's live preview, the filer's own
 * request, the reviewer's panel — so all three read the same and the rounding
 * line can never appear on one and not another. `Total` is rendered separately
 * by each (they style it differently); these are the rows above it.
 */
export function payrollMathRows(
  t: PayrollTotals,
): { label: string; value: string; tone?: string }[] {
  const rounding = roundingCents(t);
  return [
    { label: "Base salary", value: formatMoney(t.baseSalary) },
    {
      label: "Bonuses",
      value: `+ ${formatMoney(t.bonusesTotal)}`,
      tone: "text-green-700",
    },
    {
      label: "Fines",
      value: `− ${formatMoney(t.finesTotal)}`,
      tone: "text-red-600",
    },
    { label: "Expenses", value: `+ ${formatCents(t.expensesTotalCents)}` },
    // Only when there is one. Without this line the column visibly misses by a
    // few cents, which reads as a bug rather than as the rounding it is.
    ...(rounding !== 0
      ? [
          {
            label: "Rounding",
            value: `${rounding > 0 ? "+" : "−"} ${formatCents(Math.abs(rounding))}`,
          },
        ]
      : []),
  ];
}

/**
 * Cents → "$1.95", or "$39" when it's a whole number of dollars, so amounts
 * without cents read the same as the rest of the app (formatMoney). Negative
 * values keep the sign inside: "-$0.05".
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const whole = dollars.toLocaleString("en-US");
  return rest === 0
    ? `${sign}$${whole}`
    : `${sign}$${whole}.${String(rest).padStart(2, "0")}`;
}

/**
 * An amount as typed → cents, or null if it isn't a positive amount. Accepts
 * "1.95", "39", " 2.5 "; rejects "", "abc", "0" and negatives. Anything past
 * two decimals settles to the nearest cent, so "1.956" files as $1.96.
 *
 * Shared by the form and the server action deliberately: the number the filer
 * sees totalled has to be the number that gets stored.
 */
export function parseAmountCents(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Scale before rounding — 1.95 * 100 is 194.99999999999997 in binary floating
  // point, and truncating that would file $1.94.
  const cents = Math.round(n * 100);
  return cents > 0 ? cents : null;
}

/** Guard rail so a typo can't file an absurd amount (mirrors MAX_PENALTY). */
export const MAX_PAYROLL_AMOUNT = 100_000_000;

/** The same guard rail in cents, for the expense lines that carry them. */
export const MAX_PAYROLL_AMOUNT_CENTS = MAX_PAYROLL_AMOUNT * 100;

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

/**
 * One audit-trail row's verb, disambiguated by where it came from. The two
 * APPROVED_BY_ADMIN lines describe history only — no new event moves through
 * that status — and stay so an old trail still reads correctly.
 */
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
