// A week must be submitted — the previous week closed and the new week started
// with its goals — by Sunday 12:00 Tashkent time (Asia/Tashkent is UTC+5 with no
// DST). A submission after that deadline is "late". Deadlines are derived from
// the week's Monday start; production runs in UTC, which these helpers assume.

const TASHKENT_UTC_OFFSET_HOURS = 5;

/**
 * The submission deadline for a week: Sunday 12:00 Asia/Tashkent immediately
 * before the week's Monday start, as a UTC instant.
 */
export function weekSubmissionDeadline(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() - 1); // step back to the Sunday before Monday
  d.setUTCHours(12 - TASHKENT_UTC_OFFSET_HOURS, 0, 0, 0); // 12:00 UZT = 07:00 UTC
  return d;
}

/**
 * The Monday 11:00 Asia/Tashkent meeting for the week beginning `weekStart`, as
 * a UTC instant. Goals still unsubmitted at this moment are flagged "not
 * submitted" at the meeting, so submitting after it is the steeper offence.
 */
export function weekMeetingDeadline(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCHours(11 - TASHKENT_UTC_OFFSET_HOURS, 0, 0, 0); // 11:00 UZT = 06:00 UTC
  return d;
}

/**
 * Whether a week submitted at `submittedAt`, for a week beginning `weekStart`,
 * missed the Sunday-midday deadline.
 */
export function isLateSubmission(submittedAt: Date, weekStart: Date): boolean {
  return submittedAt.getTime() > weekSubmissionDeadline(weekStart).getTime();
}

// How late a submission was, which sets the fine tier:
//   on-time — by Sunday 12:00 (no fine)
//   late    — after Sunday 12:00 but by the Monday 11:00 meeting
//   missed  — after the Monday 11:00 meeting (was flagged "not submitted" there)
export type SubmissionTiming = "on-time" | "late" | "missed";

export function submissionTiming(
  submittedAt: Date,
  weekStart: Date,
): SubmissionTiming {
  const t = submittedAt.getTime();
  if (t > weekMeetingDeadline(weekStart).getTime()) return "missed";
  if (t > weekSubmissionDeadline(weekStart).getTime()) return "late";
  return "on-time";
}

/**
 * Whether `at` falls on a Sunday in Asia/Tashkent (UTC+5) — the day the weekly
 * close-and-restart is due, and the only day the review page flags who's
 * reported vs not.
 */
export function isTashkentSunday(at: Date): boolean {
  const shifted = new Date(at.getTime() + TASHKENT_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.getUTCDay() === 0;
}

// The weekly submission cycle in focus right now. The cut between one cycle and
// the next is the Sunday 12:00 deadline: from then on, "the week" people must
// have goals in for is the one starting the coming Monday. Used both to
// proactively fine missed submissions and to split the admin view into the
// previous vs current week.
export type SubmissionPhase = "before" | "late" | "missed";
export type SubmissionCycle = {
  // The target week's Monday, at UTC midnight (matches how week.startDate is
  // stored in production). Compare weeks against `submissionDeadline`, not this,
  // to stay robust to dev/prod timezone differences in stored week bounds.
  weekStart: Date;
  submissionDeadline: Date; // Sunday 12:00 Tashkent, as a UTC instant
  meetingDeadline: Date; // Monday 11:00 Tashkent, as a UTC instant
  // before  — the deadline hasn't passed yet (nothing due)
  // late    — past Sunday 12:00, not yet the Monday 11:00 meeting ($20 tier)
  // missed  — past the Monday 11:00 meeting ($40 tier)
  phase: SubmissionPhase;
};

/**
 * The submission cycle governing `now`: the week whose Sunday-12:00 deadline
 * most recently passed, plus which fine tier applies. Before the current
 * week's Sunday deadline it stays on that week (phase "before"); once the
 * deadline passes it advances to the coming Monday's week.
 */
export function currentSubmissionCycle(now = new Date()): SubmissionCycle {
  // Read the Tashkent wall clock via UTC getters on a shifted instant.
  const tash = new Date(now.getTime() + TASHKENT_UTC_OFFSET_HOURS * 3_600_000);
  const y = tash.getUTCFullYear();
  const mo = tash.getUTCMonth();
  const d = tash.getUTCDate();
  const sinceMonday = (tash.getUTCDay() + 6) % 7; // days since Monday
  const thisMonday = new Date(Date.UTC(y, mo, d - sinceMonday));
  const nextMonday = new Date(Date.UTC(y, mo, d - sinceMonday + 7));

  // We move into the coming Monday's cycle once its Sunday-12:00 deadline (this
  // Sunday) has passed; until then we're still in the current week's cycle.
  const weekStart =
    now.getTime() >= weekSubmissionDeadline(nextMonday).getTime()
      ? nextMonday
      : thisMonday;

  const submissionDeadline = weekSubmissionDeadline(weekStart);
  const meetingDeadline = weekMeetingDeadline(weekStart);
  const t = now.getTime();
  const phase: SubmissionPhase =
    t < submissionDeadline.getTime()
      ? "before"
      : t < meetingDeadline.getTime()
        ? "late"
        : "missed";

  return { weekStart, submissionDeadline, meetingDeadline, phase };
}
