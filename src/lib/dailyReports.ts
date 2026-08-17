// Server-only: who writes daily reports and who reads them. A fixed set of
// accounts owes a short report every weekday, due by midnight Tashkent (day
// math and statuses live in lib/dailyReportTypes.ts). Every send — and every
// resend after an edit — notifies the recipient (Valera); today's reports sit
// on his dashboard and /daily-reports gives him the month at a glance.

const BUILT_IN_REPORTERS = [
  "sanjar@freshman.academy",
  "sega@freshman.academy",
  "classes@freshman.academy",
  "khusanboy@freshman.academy",
];

const BUILT_IN_RECIPIENT = "valera@freshman.academy";

/**
 * Every account that owes a daily report: the built-ins plus any from the
 * DAILY_REPORT_EMAILS env var (comma-separated), lowercased. Order is
 * meaningful — review surfaces list reporters in this order.
 */
export function dailyReporterEmails(): string[] {
  const fromEnv = (process.env.DAILY_REPORT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...BUILT_IN_REPORTERS, ...fromEnv])];
}

/** Whether this account writes daily reports (case-insensitive). */
export function isDailyReporter(email: string | null | undefined): boolean {
  return !!email && dailyReporterEmails().includes(email.toLowerCase());
}

/** Who receives the reports; override with DAILY_REPORT_RECIPIENT. */
export function dailyReportRecipient(): string {
  return (
    process.env.DAILY_REPORT_RECIPIENT ?? BUILT_IN_RECIPIENT
  ).toLowerCase();
}
