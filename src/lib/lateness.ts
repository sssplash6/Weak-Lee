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
 * Whether a week submitted at `submittedAt`, for a week beginning `weekStart`,
 * missed the Sunday-midday deadline.
 */
export function isLateSubmission(submittedAt: Date, weekStart: Date): boolean {
  return submittedAt.getTime() > weekSubmissionDeadline(weekStart).getTime();
}
