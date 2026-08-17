// Client-safe daily-report vocabulary: day math, status derivation, and the
// display meta each status carries. No env or Prisma imports — who reports and
// where reports go lives in lib/dailyReports.ts (server-only). Same split as
// notificationTypes.ts vs notifications.ts.
//
// A report belongs to a Tashkent calendar day, stored at UTC midnight (the
// goal-deadline date-only convention). It is due by that day's midnight —
// i.e. the moment the next Tashkent day starts. Monday to Friday are expected;
// weekend reports are welcome but never owed.

import { fromYmd, toYmd, COMPANY_TIME_ZONE } from "@/lib/dates";

const TASHKENT_UTC_OFFSET_HOURS = 5; // no DST (see lib/lateness.ts)

/** Hard cap on a report's length; the composer counts down near it. */
export const MAX_DAILY_REPORT = 5000;

/** Nothing before this day is owed — the feature shipped here. */
export const DAILY_REPORTS_EPOCH = fromYmd("2026-08-17");

/** Today's Tashkent calendar day as "YYYY-MM-DD". */
export function tashkentTodayYmd(now: Date = new Date()): string {
  return toYmd(new Date(now.getTime() + TASHKENT_UTC_OFFSET_HOURS * 3_600_000));
}

/**
 * When the report for `day` is due: midnight at the end of that Tashkent day,
 * as a UTC instant (= day's UTC-midnight key + 24h − 5h offset).
 */
export function dayDeadline(day: Date): Date {
  return new Date(day.getTime() + (24 - TASHKENT_UTC_OFFSET_HOURS) * 3_600_000);
}

/** Whether a report is owed for this day at all (Monday–Friday). */
export function isRequiredDay(day: Date): boolean {
  const wd = day.getUTCDay();
  return wd >= 1 && wd <= 5;
}

// sent     — submitted by that day's midnight
// late     — submitted, but after midnight
// pending  — today, nothing sent yet (still time)
// upcoming — a future day (nothing owed yet)
// missed   — a required weekday that ended with no report
// skipped  — a weekend (or pre-launch day) with no report: never owed
export type DailyReportStatus =
  | "sent"
  | "late"
  | "pending"
  | "upcoming"
  | "missed"
  | "skipped";

export function reportStatus(
  day: Date,
  submittedAt: Date | null,
  now: Date = new Date(),
): DailyReportStatus {
  if (submittedAt) {
    return submittedAt.getTime() <= dayDeadline(day).getTime()
      ? "sent"
      : "late";
  }
  if (now.getTime() < dayDeadline(day).getTime()) {
    return toYmd(day) === tashkentTodayYmd(now) ? "pending" : "upcoming";
  }
  return isRequiredDay(day) && day.getTime() >= DAILY_REPORTS_EPOCH.getTime()
    ? "missed"
    : "skipped";
}

/**
 * Display meta per status. Dots use the chart status triad (good/warn/bad,
 * mute for "doesn't count") — state colors, deliberately not the brand or
 * accent hues. `pending` renders as a hollow slot: the day is still open.
 */
export const DAILY_REPORT_STATUS: Record<
  DailyReportStatus,
  { label: string; dot: string }
> = {
  sent: { label: "Sent", dot: "bg-chart-good" },
  late: { label: "Sent late", dot: "bg-chart-warn" },
  pending: { label: "Due by midnight", dot: "border-[1.5px] border-muted-fg" },
  upcoming: { label: "Upcoming", dot: "bg-line" },
  missed: { label: "Not sent", dot: "bg-chart-bad" },
  skipped: { label: "Weekend", dot: "bg-chart-mute" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-08-17" → "Mon, 17 Aug" (year appended when it isn't the current one). */
export function dayLabel(ymd: string, currentYear?: number): string {
  const d = fromYmd(ymd);
  const [y, m, dd] = ymd.split("-").map(Number);
  const base = `${WEEKDAYS[d.getUTCDay()]}, ${dd} ${MONTHS[m - 1]}`;
  return currentYear != null && y !== currentYear ? `${base} ${y}` : base;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A Date (or ISO string) → "09:32 AM" on the company clock (Tashkent). */
export function formatTimeTz(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: COMPANY_TIME_ZONE,
  });
}
