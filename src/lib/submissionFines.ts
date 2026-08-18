// Proactive late-submission fining. Instead of only fining people when they
// eventually submit late (which let no-shows escape entirely), this reconciles
// the current weekly cycle and fines anyone who missed the deadline:
//   • after Sunday 12:00 (Tashkent) — $20 for goals not yet submitted
//   • after Monday 11:00           — escalate an unpaid $20 to $40
// It's idempotent (at most one late-submission fine per person per cycle) so it
// can safely run on any page load or a cron ping. People who submitted on time
// are never fined; people who submitted late keep the $20 they earned. Accounts
// on the submission-exempt list (see lib/submissionExempt.ts) are skipped
// entirely — they may still set goals, they're just never fined for not doing it.

import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import {
  formatMoney,
  LATE_SUBMISSION_PENALTY,
  MISSED_SUBMISSION_PENALTY,
} from "@/lib/penalties";
import {
  currentSubmissionCycle,
  SUBMISSION_DEADLINE_EPOCH,
  TRIP_SHIFTED_DEADLINE_FROM,
  TRIP_SHIFTED_DEADLINE_TO,
} from "@/lib/lateness";
import {
  isSubmissionExempt,
  submissionExemptEmails,
} from "@/lib/submissionExempt";

const LATE_NOTE = "Goals not submitted by the Sunday 12:00 deadline";
const MISSED_NOTE = "Goals not submitted by the Monday 11:00 meeting";
// The 2026-08-16 trip week runs on a midnight deadline; a fine issued for
// missing it shouldn't cite noon.
const LATE_NOTE_TRIP =
  "Goals not submitted by the Sunday midnight deadline (trip week)";

/**
 * Reconcile late-submission fines for the current cycle. Pass a `userId` to
 * reconcile just that person (used on their own dashboard load); omit it to
 * sweep the whole team (used on admin load / cron).
 */
export async function reconcileSubmissionFines(opts?: {
  userId?: string;
}): Promise<void> {
  const now = new Date();
  const cycle = currentSubmissionCycle(now);

  // Clear anything an exempt account is still carrying first — this runs on
  // every phase, so adding an exemption takes effect on the next page load
  // rather than waiting for a deadline to come round.
  await releaseExemptSubmissionFines(opts?.userId);

  // Undo what the noon sweep wrote before the 2026-08-16 deadline moved to
  // midnight (see TRIP_SHIFTED_DEADLINE_* in lib/lateness.ts).
  await releaseTripShiftedFines(now, opts?.userId);

  // Nothing due yet, or a cycle from before the deadline was enforced.
  if (cycle.phase === "before") return;
  if (
    cycle.submissionDeadline.getTime() < SUBMISSION_DEADLINE_EPOCH.getTime()
  ) {
    return;
  }

  const { submissionDeadline, meetingDeadline, phase } = cycle;

  const users = await prisma.user.findMany({
    where: {
      // Only people who were around before the deadline (new joiners get a pass
      // this cycle) and have onboarded (department is set on completing it).
      createdAt: { lt: submissionDeadline },
      department: { not: null },
      ...(opts?.userId ? { id: opts.userId } : {}),
    },
    select: {
      id: true,
      email: true,
      // Every week for this cycle (starting on/after the deadline). Usually one,
      // but a redeploy race in getOrCreateCurrentWeek/startNewWeek can leave a
      // stray duplicate — so we look at all of them, not just one.
      weeks: {
        where: { startDate: { gte: submissionDeadline } },
        select: { id: true, submittedAt: true },
      },
      // This cycle's late-submission fine, if one has been issued already.
      penalties: {
        where: {
          type: "LATE_SUBMISSION",
          createdAt: { gte: submissionDeadline },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, paidAt: true, paidAmount: true },
      },
    },
  });

  // Cycles an admin has already forgiven for someone (they removed the fine on
  // the admin page). Without this the sweep would re-derive the fine from the
  // unsubmitted week on the very next page load and undo the decision.
  const waived = new Set(
    (
      await prisma.fineWaiver.findMany({
        where: {
          cycleDeadline: submissionDeadline,
          ...(opts?.userId ? { userId: opts.userId } : {}),
        },
        select: { userId: true },
      })
    ).map((w) => w.userId),
  );

  for (const u of users) {
    // Accounts not expected to report weekly (e.g. alumni) are never fined for
    // it — releaseExemptSubmissionFines above has already cleaned up after them.
    if (isSubmissionExempt(u.email)) continue;
    if (waived.has(u.id)) continue;

    // Count as submitted if ANY current-cycle week is, and tier by the earliest
    // submission — so a stray unsubmitted duplicate can't wrongly flag someone
    // who actually reported on time.
    const submits = u.weeks
      .map((w) => w.submittedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime());
    const earliestSubmit = submits[0] ?? null;

    const amount = dueAmount(
      earliestSubmit,
      phase,
      submissionDeadline,
      meetingDeadline,
    );
    const existing = u.penalties[0];

    if (amount === 0) {
      // Submitted on time. If a fine exists and nothing has been paid against
      // it, it was created in error (the duplicate-week bug) — remove it and
      // let the person know. Once money has moved, an admin has to unwind it
      // deliberately on /penalties; deleting it here would erase the payment.
      if (existing && existing.paidAt == null && existing.paidAmount === 0) {
        await prisma.$transaction(async (tx) => {
          await tx.penalty.delete({ where: { id: existing.id } });
          await notify(
            tx,
            u.id,
            "FINE",
            `Your ${formatMoney(existing.amount)} late-submission fine was removed — your goals were submitted on time.`,
          );
        });
      }
      continue;
    }

    // Prefer linking the fine to the submitted week, else any current-cycle one.
    const weekId =
      u.weeks.find((w) => w.submittedAt != null)?.id ??
      u.weeks[0]?.id ??
      null;
    const missed = amount >= MISSED_SUBMISSION_PENALTY;
    const shiftedWeek =
      submissionDeadline.getTime() === TRIP_SHIFTED_DEADLINE_TO.getTime();
    const note = missed ? MISSED_NOTE : shiftedWeek ? LATE_NOTE_TRIP : LATE_NOTE;

    if (!existing) {
      await prisma.$transaction(async (tx) => {
        // Re-check inside the transaction to narrow the double-create window if
        // two reconciles race (e.g. the admin sweep and the person's own load).
        const already = await tx.penalty.findFirst({
          where: {
            userId: u.id,
            type: "LATE_SUBMISSION",
            createdAt: { gte: submissionDeadline },
          },
          select: { id: true },
        });
        if (already) return;
        await tx.penalty.create({
          data: { userId: u.id, type: "LATE_SUBMISSION", amount, note, weekId },
        });
        await notify(
          tx,
          u.id,
          "FINE",
          missed
            ? `You were fined ${formatMoney(amount)} for not submitting your goals by the Monday 11:00 meeting.`
            : `You were fined ${formatMoney(amount)} for not submitting your goals by the Sunday ${shiftedWeek ? "midnight" : "12:00"} deadline.`,
        );
      });
    } else if (existing.paidAt == null && existing.amount < amount) {
      // Escalate an unpaid $20 to $40 at the Monday meeting. A fine that's
      // already been settled is left alone rather than silently re-priced. A
      // part-paid one does escalate — the amount only ever goes up, so what's
      // been paid still stands and the person simply owes the difference.
      await prisma.$transaction(async (tx) => {
        await tx.penalty.update({
          where: { id: existing.id },
          data: { amount, note, ...(weekId ? { weekId } : {}) },
        });
        await notify(
          tx,
          u.id,
          "FINE",
          `Your late-submission fine was raised to ${formatMoney(amount)} — goals still not submitted at the Monday 11:00 meeting.`,
        );
      });
    } else if (
      existing.paidAt == null &&
      existing.amount > amount &&
      existing.paidAmount <= amount
    ) {
      // Re-price DOWN too: a $40 "missed the meeting" fine issued while the
      // person looked like a no-show drops back to $20 once their submission
      // turns out to have landed before the meeting (the sweep runs between
      // page loads, so it can escalate before it has seen a submit). What's
      // been paid stays paid — shrink only while paid ≤ the new amount;
      // anything odder is admin territory on /penalties.
      await prisma.$transaction(async (tx) => {
        await tx.penalty.update({
          where: { id: existing.id },
          data: { amount, note, ...(weekId ? { weekId } : {}) },
        });
        await notify(
          tx,
          u.id,
          "FINE",
          `Your late-submission fine was reduced to ${formatMoney(amount)} — your goals were in before the Monday 11:00 meeting.`,
        );
      });
    }
  }
}

/**
 * Drop any untouched late-submission fine held by an exempt account — whether
 * it predates the exemption or slipped through some other path. Fines with
 * money against them are left alone (it already moved; an admin can reopen one
 * on /penalties if it was wrong). Pass a `userId` to limit this to one person,
 * matching the sweep above.
 */
async function releaseExemptSubmissionFines(userId?: string): Promise<void> {
  const exempt = await prisma.user.findMany({
    where: {
      email: { in: submissionExemptEmails(), mode: "insensitive" },
      ...(userId ? { id: userId } : {}),
    },
    select: {
      id: true,
      penalties: {
        where: { type: "LATE_SUBMISSION", paidAt: null, paidAmount: 0 },
        select: { id: true, amount: true },
      },
    },
  });

  for (const u of exempt) {
    if (u.penalties.length === 0) continue;
    const total = u.penalties.reduce((sum, p) => sum + p.amount, 0);
    const label =
      u.penalties.length > 1
        ? `late-submission fines totalling ${formatMoney(total)}`
        : `${formatMoney(total)} late-submission fine`;
    await prisma.$transaction(async (tx) => {
      await tx.penalty.deleteMany({
        where: { id: { in: u.penalties.map((p) => p.id) } },
      });
      await notify(
        tx,
        u.id,
        "FINE",
        `Your ${label} was removed — this account isn't fined for late weekly submissions.`,
      );
    });
  }
}

/**
 * One-off follow-through for the trip-shifted 2026-08-16 deadline (see
 * TRIP_SHIFTED_DEADLINE_* in lib/lateness.ts): by the time the deadline moved
 * from Sunday noon to midnight, the noon sweep had already fined people and
 * flagged weeks "late". This unwinds everything the noon deadline wrote:
 *   • drops untouched fines from the noon sweep (money already settled against
 *     one freezes it, same rule as everywhere else — /penalties can unwind it),
 *   • clears the Late flag on weeks submitted between noon and midnight,
 *   • re-keys waivers an admin granted against the noon deadline so the
 *     forgiveness still counts for this cycle after it re-keys to midnight.
 * Idempotent — after the first pass nothing matches — and inert once the trip
 * cycle is a week old, at which point this function can simply be deleted.
 */
async function releaseTripShiftedFines(
  now: Date,
  userId?: string,
): Promise<void> {
  const from = TRIP_SHIFTED_DEADLINE_FROM;
  const to = TRIP_SHIFTED_DEADLINE_TO;
  if (now.getTime() >= to.getTime() + 7 * 86_400_000) return;
  const scope = userId ? { userId } : {};

  try {
    const fines = await prisma.penalty.findMany({
      where: {
        type: "LATE_SUBMISSION",
        createdAt: { gte: from, lt: to },
        paidAt: null,
        paidAmount: 0,
        ...scope,
      },
      select: { id: true, userId: true, amount: true },
    });
    for (const f of fines) {
      await prisma.$transaction(async (tx) => {
        // Re-check the untouched guard inside the delete itself, in case a
        // payment landed (or a racing reconcile already deleted it) since the
        // read above.
        const del = await tx.penalty.deleteMany({
          where: { id: f.id, paidAt: null, paidAmount: 0 },
        });
        if (del.count === 0) return;
        await notify(
          tx,
          f.userId,
          "FINE",
          `Your ${formatMoney(f.amount)} late-submission fine was removed — this week's deadline moved from Sunday noon to midnight for the team trip.`,
        );
      });
    }

    // Weeks submitted between noon and midnight were stamped late on the way
    // in; under the midnight deadline they're on time. Only this cycle's weeks
    // qualify — a week from an older cycle submitted today really is late.
    await prisma.week.updateMany({
      where: {
        submittedLate: true,
        submittedAt: { gte: from, lt: to },
        startDate: { gte: from },
        ...scope,
      },
      data: { submittedLate: false },
    });

    await prisma.fineWaiver.updateMany({
      where: { cycleDeadline: from, ...scope },
      data: { cycleDeadline: to },
    });
  } catch (e) {
    // A one-off cleanup must never take a page load down with it.
    console.error("releaseTripShiftedFines failed", e);
  }
}

/** The fine a person owes for the cycle, given when (if ever) they submitted. */
function dueAmount(
  submittedAt: Date | null,
  phase: "before" | "late" | "missed",
  submissionDeadline: Date,
  meetingDeadline: Date,
): number {
  if (submittedAt) {
    if (submittedAt.getTime() <= submissionDeadline.getTime()) return 0; // on time
    if (submittedAt.getTime() <= meetingDeadline.getTime()) {
      return LATE_SUBMISSION_PENALTY; // late, but before the meeting
    }
    return MISSED_SUBMISSION_PENALTY; // submitted after the meeting
  }
  // Never submitted — tier by how far past the deadline we are now.
  return phase === "missed" ? MISSED_SUBMISSION_PENALTY : LATE_SUBMISSION_PENALTY;
}
