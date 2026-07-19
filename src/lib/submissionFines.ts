// Proactive late-submission fining. Instead of only fining people when they
// eventually submit late (which let no-shows escape entirely), this reconciles
// the current weekly cycle and fines anyone who missed the deadline:
//   • after Sunday 12:00 (Tashkent) — $20 for goals not yet submitted
//   • after Monday 11:00           — escalate an unpaid $20 to $40
// It's idempotent (at most one late-submission fine per person per cycle) so it
// can safely run on any page load or a cron ping. People who submitted on time
// are never fined; people who submitted late keep the $20 they earned.

import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import {
  formatMoney,
  LATE_SUBMISSION_PENALTY,
  MISSED_SUBMISSION_PENALTY,
} from "@/lib/penalties";
import { currentSubmissionCycle } from "@/lib/lateness";

// Don't retroactively fine for weekly cycles whose deadline fell before this
// feature went live — its first governed cycle is the one due 2026-07-19 12:00
// Tashkent (= 07:00 UTC). Cycles older than this are skipped entirely.
const SUBMISSION_FINES_EPOCH = new Date("2026-07-19T07:00:00.000Z");

const LATE_NOTE = "Goals not submitted by the Sunday 12:00 deadline";
const MISSED_NOTE = "Goals not submitted by the Monday 11:00 meeting";

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

  // Nothing due yet, or a cycle from before the feature existed.
  if (cycle.phase === "before") return;
  if (cycle.submissionDeadline.getTime() < SUBMISSION_FINES_EPOCH.getTime()) {
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
      // This cycle's week: the earliest week starting on/after the deadline
      // (the coming Monday's). Absent = they never reported for it.
      weeks: {
        where: { startDate: { gte: submissionDeadline } },
        orderBy: { startDate: "asc" },
        take: 1,
        select: { id: true, submittedAt: true },
      },
      // This cycle's late-submission fine, if one has been issued already.
      penalties: {
        where: {
          type: "LATE_SUBMISSION",
          createdAt: { gte: submissionDeadline },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, paidAt: true },
      },
    },
  });

  for (const u of users) {
    const submittedAt = u.weeks[0]?.submittedAt ?? null;
    const weekId = u.weeks[0]?.id ?? null;

    // What this person owes right now for the cycle.
    const amount = dueAmount(submittedAt, phase, submissionDeadline, meetingDeadline);
    if (amount === 0) continue;

    const existing = u.penalties[0];
    const missed = amount >= MISSED_SUBMISSION_PENALTY;
    const note = missed ? MISSED_NOTE : LATE_NOTE;

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
            : `You were fined ${formatMoney(amount)} for not submitting your goals by the Sunday 12:00 deadline.`,
        );
      });
    } else if (existing.paidAt == null && existing.amount < amount) {
      // Escalate an unpaid $20 to $40 at the Monday meeting. A fine that's
      // already been settled is left alone rather than silently re-priced.
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
    }
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
