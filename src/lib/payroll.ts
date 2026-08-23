// Server-only payroll domain: who plays which role, the Tashkent month math,
// the status machine with its append-only audit log, the ledger snapshot taken
// at submit time, the lazy expiry + reminder sweeps (no cron anywhere — the
// lib/submissionFines.ts pattern), and the money write-back at PROCESSED.
//
//   DRAFT → SUBMITTED → (DECLINED → SUBMITTED)* → APPROVED_BY_ADMIN → PROCESSED
//                            └───────────────▶ EXPIRED
//
// Server actions own authorization and notifications; this module owns the
// rules — every transition goes through applyTransition so no status change
// can skip the guard or the audit row.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import {
  formatMoney,
  PENALTY_LABEL,
  type PenaltyType,
} from "@/lib/penalties";
import {
  payrollPeriodLabel,
  PAYROLL_CLOSED,
  PAYROLL_STATUS_LABEL,
} from "@/lib/payrollTypes";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import type { PayrollStatus, Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

// ----- Roles -----
//
// Payroll's two review stages are deliberately narrower than the global admin
// list: valera@ is a built-in admin app-wide, but inside payroll he is the
// finance stage only, and tech@/shakhzod@ are the admin stage. Env vars ADD
// reviewers (the ADMIN_EMAILS convention) — handy for exercising the queues as
// dev@freshman.academy locally.

const BUILT_IN_PAYROLL_ADMINS = [
  "tech@freshman.academy",
  "shakhzod@freshman.academy",
];

const BUILT_IN_FINANCE = ["valera@freshman.academy"];

function withEnvEmails(builtIn: string[], envVar: string): string[] {
  const fromEnv = (process.env[envVar] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...builtIn, ...fromEnv])];
}

/** The admin-stage reviewers (first approval). */
export function payrollAdminEmails(): string[] {
  return withEnvEmails(BUILT_IN_PAYROLL_ADMINS, "PAYROLL_ADMIN_EMAILS");
}

export function isPayrollAdmin(email: string | null | undefined): boolean {
  return !!email && payrollAdminEmails().includes(email.toLowerCase());
}

/** The finance-stage reviewers (payment). */
export function financeEmails(): string[] {
  return withEnvEmails(BUILT_IN_FINANCE, "PAYROLL_FINANCE_EMAILS");
}

export function isFinance(email: string | null | undefined): boolean {
  return !!email && financeEmails().includes(email.toLowerCase());
}

/** Stats are for everyone who reviews money: global admins + both stages. */
export function canViewPayrollStats(email: string | null | undefined): boolean {
  return isAdmin(email) || isPayrollAdmin(email) || isFinance(email);
}

type SessionLike = {
  user?: { id?: string; email?: string | null };
} | null;

/** Throw unless the signed-in user is an admin-stage reviewer; returns their id. */
export async function requirePayrollAdmin(session: SessionLike): Promise<string> {
  const id = session?.user?.id;
  if (!id || !isPayrollAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  return id;
}

/** Throw unless the signed-in user is a finance-stage reviewer; returns their id. */
export async function requireFinance(session: SessionLike): Promise<string> {
  const id = session?.user?.id;
  if (!id || !isFinance(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  return id;
}

/** User rows for a list of reviewer emails (those never signed in are skipped). */
export async function reviewerUsers(
  db: Db,
  emails: string[],
): Promise<{ id: string; email: string | null }[]> {
  return db.user.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, email: true },
  });
}

// ----- The calendar month, in Tashkent -----

const TASHKENT_UTC_OFFSET_HOURS = 5; // Asia/Tashkent is UTC+5, no DST
const OFFSET_MS = TASHKENT_UTC_OFFSET_HOURS * 3_600_000;

export type PayrollPeriodBounds = {
  year: number;
  month: number; // 1–12
  startsAt: Date;
  endsAt: Date;
  filingClosesAt: Date;
  remindAt: Date;
};

/**
 * The payroll period `now` falls in, all boundaries as UTC instants of
 * Tashkent wall-clock times: the month runs [1st 00:00, next 1st 00:00),
 * filing closes 23:59:59 on the last day, and the reminder fires 09:00 three
 * days before the last day (Aug 31st → Aug 28th).
 */
export function periodBoundsFor(now: Date): PayrollPeriodBounds {
  const tash = new Date(now.getTime() + OFFSET_MS);
  const year = tash.getUTCFullYear();
  const m0 = tash.getUTCMonth();
  const startsAt = new Date(Date.UTC(year, m0, 1) - OFFSET_MS);
  const endsAt = new Date(Date.UTC(year, m0 + 1, 1) - OFFSET_MS);
  const filingClosesAt = new Date(endsAt.getTime() - 1_000);
  const lastDay = new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate();
  const remindAt = new Date(Date.UTC(year, m0, lastDay - 3, 9) - OFFSET_MS);
  return { year, month: m0 + 1, startsAt, endsAt, filingClosesAt, remindAt };
}

/**
 * The PayrollPeriod row governing `now`, created on first touch. Rows only
 * exist from the feature's launch month onward, so closed-period surfaces
 * ("did not file", stats history) never reach back before payroll existed.
 */
export async function ensureCurrentPeriod(db: Db = prisma, now = new Date()) {
  const b = periodBoundsFor(now);
  return db.payrollPeriod.upsert({
    where: { year_month: { year: b.year, month: b.month } },
    update: {},
    create: b,
  });
}

// ----- Status machine -----

const TRANSITIONS: Record<PayrollStatus, readonly PayrollStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["DECLINED", "APPROVED_BY_ADMIN"],
  DECLINED: ["SUBMITTED", "EXPIRED"],
  APPROVED_BY_ADMIN: ["SUBMITTED", "PROCESSED"], // send-back | paid
  EXPIRED: [],
  PROCESSED: [],
};

/** The statuses that block filing another period (see PayrollSubmission docs). */
export const IN_FLIGHT_STATUSES: PayrollStatus[] = [
  "SUBMITTED",
  "DECLINED",
  "APPROVED_BY_ADMIN",
];

export function assertTransition(from: PayrollStatus, to: PayrollStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(
      `A request that is “${PAYROLL_STATUS_LABEL[from]}” can't move to “${PAYROLL_STATUS_LABEL[to]}”.`,
    );
  }
}

/**
 * The only way a submission changes status. Guards the transition against the
 * machine, applies it optimistically (the row must still be in `from`, so two
 * reviewers acting at once can't both land), and writes the audit event in the
 * same breath. `data` carries the transition's scalar side effects
 * (resubmitDeadline, processedAt, …); `actorId` null means the system.
 */
export async function applyTransition(
  db: Db,
  opts: {
    submissionId: string;
    from: PayrollStatus;
    to: PayrollStatus;
    actorId: string | null;
    note?: string | null;
    data?: Prisma.PayrollSubmissionUpdateManyMutationInput;
  },
): Promise<void> {
  assertTransition(opts.from, opts.to);
  const updated = await db.payrollSubmission.updateMany({
    where: { id: opts.submissionId, status: opts.from },
    data: { ...opts.data, status: opts.to },
  });
  if (updated.count === 0) {
    throw new Error("This request changed while you were acting — reload and try again.");
  }
  await db.payrollEvent.create({
    data: {
      submissionId: opts.submissionId,
      actorId: opts.actorId,
      fromStatus: opts.from,
      toStatus: opts.to,
      note: opts.note?.trim().slice(0, 1000) || null,
    },
  });
}

/**
 * The resubmit window a decline at `now` grants: 24 hours, allowed to run past
 * the month's filing cutoff by at most one day — min(now + 24h,
 * filingClosesAt + 24h) — so a decline late on the last day still leaves a
 * full day to fix and resend, but a re-decline after the cutoff never extends
 * further. Returns whether that window reaches past the cutoff (the
 * once-per-period grace day).
 */
export function resubmitWindowFor(
  now: Date,
  filingClosesAt: Date,
): { deadline: Date; usesGraceDay: boolean } {
  const deadline = new Date(
    Math.min(now.getTime() + 24 * 3_600_000, filingClosesAt.getTime() + 24 * 3_600_000),
  );
  return { deadline, usesGraceDay: deadline.getTime() > filingClosesAt.getTime() };
}

/**
 * Move DECLINED submissions whose resubmit window has lapsed to EXPIRED.
 * Lazy and idempotent — called from every payroll surface before it reads, so
 * nobody ever sees (or acts on) a window that is really over. The optimistic
 * update makes concurrent sweeps write one audit row, not two.
 */
export async function expireLapsedSubmissions(now = new Date()): Promise<void> {
  // Closed: a decline window that lapses while nobody can refile isn't the
  // employee's fault, so nothing expires until payroll reopens.
  if (PAYROLL_CLOSED) return;
  const lapsed = await prisma.payrollSubmission.findMany({
    where: { status: "DECLINED", resubmitDeadline: { lt: now } },
    select: { id: true },
  });
  for (const s of lapsed) {
    const updated = await prisma.payrollSubmission.updateMany({
      where: { id: s.id, status: "DECLINED" },
      data: { status: "EXPIRED" },
    });
    if (updated.count === 0) continue; // another request expired it first
    await prisma.payrollEvent.create({
      data: {
        submissionId: s.id,
        actorId: null,
        fromStatus: "DECLINED",
        toStatus: "EXPIRED",
        note: "Resubmit window lapsed.",
      },
    });
  }
}

// ----- Who files -----

/**
 * Everyone expected to file: approved and onboarded (≥1 department seat).
 * Unlike weekly-goal expectations this is NOT lead-gated — members get paid
 * too. Department leads get no payroll powers over their members.
 */
export async function eligibleEmployees(db: Db = prisma) {
  return db.user.findMany({
    where: { approvedAt: { not: null }, memberships: { some: {} } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/**
 * The submission blocking this user from filing a new period, if any. At most
 * one request may be in flight across all periods — filing September while
 * August is still SUBMITTED would put the same bonuses and fines into two
 * snapshots and pay them twice. Callers run expireLapsedSubmissions first so
 * a dead DECLINED row doesn't block anyone.
 */
export async function inFlightSubmission(db: Db, userId: string) {
  return db.payrollSubmission.findFirst({
    where: { userId, status: { in: IN_FLIGHT_STATUSES } },
    select: {
      id: true,
      status: true,
      period: { select: { year: true, month: true } },
    },
  });
}

// ----- The ledger snapshot -----

export type LedgerSnapshot = {
  bonusLines: {
    bonusId: string;
    amount: number;
    note: string | null;
    awardedAt: Date;
  }[];
  fineLines: {
    penaltyId: string;
    amount: number; // outstanding at snapshot, not face value
    type: PenaltyType;
    note: string | null;
    issuedAt: Date;
  }[];
  bonusesTotal: number;
  finesTotal: number;
};

/**
 * What the ledger owes and is owed by this person right now: every bonus not
 * yet paid out through payroll, and the OUTSTANDING balance of every open
 * fine (partial payments already exist, so face value would over-deduct).
 * Copied onto the submission at (re)submit time — never read live again.
 */
export async function pullLedgerSnapshot(
  db: Db,
  userId: string,
): Promise<LedgerSnapshot> {
  const bonuses = await db.bonus.findMany({
    where: { userId, payrollSubmissionId: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, amount: true, note: true, createdAt: true },
  });
  const fines = await db.penalty.findMany({
    where: { userId, paidAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      amount: true,
      paidAmount: true,
      type: true,
      note: true,
      createdAt: true,
    },
  });

  const bonusLines = bonuses.map((b) => ({
    bonusId: b.id,
    amount: b.amount,
    note: b.note,
    awardedAt: b.createdAt,
  }));
  const fineLines = fines
    .map((f) => ({
      penaltyId: f.id,
      amount: f.amount - f.paidAmount,
      type: f.type,
      note: f.note,
      issuedAt: f.createdAt,
    }))
    .filter((l) => l.amount > 0);

  return {
    bonusLines,
    fineLines,
    bonusesTotal: bonusLines.reduce((s, l) => s + l.amount, 0),
    finesTotal: fineLines.reduce((s, l) => s + l.amount, 0),
  };
}

// ----- Processing (finance confirm) -----

export type ProcessResult =
  | { ok: true; batchId: string | null }
  | { ok: false; reasons: string[] };

/**
 * Pay a submission out: verify the snapshot still matches the ledger, write
 * the fine deduction back as ONE FinePayment batch (source PAYROLL — it reads
 * as a receipt on /penalties and undoes there like any settlement), stamp the
 * bonuses consumed, and move to PROCESSED.
 *
 * The re-check is the invoice-immutability guard: if someone settled a
 * snapshotted fine in cash or deleted a snapshotted bonus after filing, the
 * approved numbers no longer describe reality — processing is refused with
 * the exact reasons, and finance sends the request back for a fresh snapshot
 * instead of silently paying wrong amounts. The per-fine optimistic locks
 * (the recordSettlement idiom) close the race window inside the transaction.
 */
export async function processSubmission(opts: {
  submissionId: string;
  actorId: string;
}): Promise<ProcessResult> {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.payrollSubmission.findUnique({
      where: { id: opts.submissionId },
      select: {
        id: true,
        status: true,
        fineLines: true,
        bonusLines: true,
      },
    });
    if (!sub) throw new Error("Request not found.");
    if (sub.status !== "APPROVED_BY_ADMIN") {
      throw new Error("Only a request that is with finance can be processed.");
    }

    // Re-check every snapshotted source against the live ledger.
    const reasons: string[] = [];
    const finesById = new Map<
      string,
      { amount: number; paidAmount: number; paidAt: Date | null }
    >();
    for (const line of sub.fineLines) {
      const label = `${PENALTY_LABEL[line.type]} fine (${formatMoney(line.amount)})`;
      const penalty = line.penaltyId
        ? await tx.penalty.findUnique({
            where: { id: line.penaltyId },
            select: { amount: true, paidAmount: true, paidAt: true },
          })
        : null;
      if (!penalty) {
        reasons.push(`${label} was deleted after filing.`);
        continue;
      }
      finesById.set(line.penaltyId!, penalty);
      if (penalty.paidAt !== null || penalty.amount - penalty.paidAmount < line.amount) {
        reasons.push(`${label} was settled outside payroll after filing.`);
      }
    }
    for (const line of sub.bonusLines) {
      const label = `${formatMoney(line.amount)} bonus`;
      const bonus = line.bonusId
        ? await tx.bonus.findUnique({
            where: { id: line.bonusId },
            select: { amount: true, payrollSubmissionId: true },
          })
        : null;
      if (!bonus) reasons.push(`${label} was deleted after filing.`);
      else if (bonus.payrollSubmissionId) reasons.push(`${label} was already paid out.`);
      else if (bonus.amount !== line.amount) reasons.push(`${label} changed amount after filing.`);
    }
    if (reasons.length > 0) return { ok: false, reasons };

    // Fine write-back: exactly the snapshotted amount against exactly that
    // fine — never oldest-first over whatever happens to be open today, or a
    // fine raised after filing could eat money the invoice never deducted.
    const batchId = sub.fineLines.length > 0 ? randomUUID() : null;
    const now = new Date();
    for (const line of sub.fineLines) {
      const fine = finesById.get(line.penaltyId!)!;
      const paidAmount = fine.paidAmount + line.amount;
      const updated = await tx.penalty.updateMany({
        where: { id: line.penaltyId!, paidAt: null, paidAmount: fine.paidAmount },
        data: {
          paidAmount,
          ...(paidAmount === fine.amount
            ? { paidAt: now, settledById: opts.actorId }
            : {}),
        },
      });
      if (updated.count === 0) {
        throw new Error("The fines ledger changed while processing — try again.");
      }
      await tx.finePayment.create({
        data: {
          penaltyId: line.penaltyId!,
          amount: line.amount,
          batchId: batchId!,
          source: "PAYROLL",
          recordedById: opts.actorId,
        },
      });
    }

    // Bonuses are consumed by this submission — they can never snapshot again.
    const bonusIds = sub.bonusLines.map((l) => l.bonusId!);
    if (bonusIds.length > 0) {
      const stamped = await tx.bonus.updateMany({
        where: { id: { in: bonusIds }, payrollSubmissionId: null },
        data: { payrollSubmissionId: sub.id },
      });
      if (stamped.count !== bonusIds.length) {
        throw new Error("The bonus ledger changed while processing — try again.");
      }
    }

    await applyTransition(tx, {
      submissionId: sub.id,
      from: "APPROVED_BY_ADMIN",
      to: "PROCESSED",
      actorId: opts.actorId,
      data: { processedAt: now, fineBatchId: batchId },
    });
    return { ok: true, batchId };
  });
}

// ----- Reminder sweep -----

/** Absolute base for links in payroll emails (same var Auth.js builds from). */
export function appUrl(): string {
  return process.env.AUTH_URL ?? "https://www.freshweek.org";
}

/**
 * The filing reminder: 09:00 Tashkent three days before the month's last day,
 * in-app + email to every eligible employee who hasn't submitted this period.
 * No cron exists — this runs lazily on payroll/dashboard loads, and the
 * optimistic claim on `reminderSentAt` makes it fire exactly once per period
 * however many requests race it. Declined and expired people are not nagged:
 * they DID file (their decline carries its own deadline), and an expired
 * filing rolls to next month by design.
 */
export async function reconcilePayrollReminders(now = new Date()): Promise<void> {
  // Closed: never nag people to file a feature they can't reach. The claim on
  // reminderSentAt is left unset, so reopening still gets its one reminder.
  if (PAYROLL_CLOSED) return;
  const period = await ensureCurrentPeriod(prisma, now);
  if (period.reminderSentAt) return;
  if (now < period.remindAt || now > period.filingClosesAt) return;

  const claimed = await prisma.payrollPeriod.updateMany({
    where: { id: period.id, reminderSentAt: null },
    data: { reminderSentAt: now },
  });
  if (claimed.count === 0) return; // another request beat us to it

  const [employees, filed] = await Promise.all([
    eligibleEmployees(prisma),
    prisma.payrollSubmission.findMany({
      where: { periodId: period.id, status: { not: "DRAFT" } },
      select: { userId: true },
    }),
  ]);
  const filedIds = new Set(filed.map((s) => s.userId));
  const unfiled = employees.filter((e) => !filedIds.has(e.id));
  if (unfiled.length === 0) return; // nobody to remind — the claim is spent

  const label = payrollPeriodLabel(period.year, period.month);
  const message =
    `Payroll: file your ${label} pay request — filing closes ` +
    `${formatTashkent(period.filingClosesAt)}.`;

  // The claim above is what stops several page loads all sending this. But a
  // claim that survives a failed delivery doesn't lose one reminder — it
  // suppresses the only one this period will ever get, right before a deadline
  // people are fined against. So hand it back on failure and let the next load
  // try again. That can re-notify someone the first attempt did reach; a
  // duplicate nudge is the cheaper mistake by a wide margin.
  try {
    await notify(
      prisma,
      unfiled.map((e) => e.id),
      "PAYROLL",
      message,
    );
    const sent = await Promise.all(
      unfiled
        .filter((e) => e.email)
        .map((e) =>
          sendEmail({
            to: e.email!,
            subject: `Payroll: ${label} filing closes soon`,
            text:
              `Hi${e.name ? ` ${e.name}` : ""},\n\n` +
              `You haven't filed your ${label} pay request yet. Filing closes ` +
              `${formatTashkent(period.filingClosesAt)}.\n\n` +
              `File it here: ${appUrl()}/payroll\n\n— FreshWeek`,
          }),
        ),
    );
    if (sent.some((ok) => !ok)) {
      throw new Error("at least one payroll reminder email did not go out");
    }
  } catch (e) {
    console.error("reconcilePayrollReminders: releasing the claim to retry", e);
    await prisma.payrollPeriod.updateMany({
      where: { id: period.id },
      data: { reminderSentAt: null },
    });
  }
}

/** "Sun, Aug 31, 11:59 PM (Tashkent)" — deadlines always read in company time. */
export function formatTashkent(at: Date): string {
  return (
    at.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Tashkent",
    }) + " (Tashkent)"
  );
}
