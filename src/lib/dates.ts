// Pure date helpers for date-only values. No server-only imports — safe in
// client components. Deadlines are stored at UTC midnight and treated as a plain
// calendar day, so we read/write them with UTC getters to avoid timezone drift.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A Date (or ISO string) → "YYYY-MM-DD" using its UTC calendar day. */
export function toYmd(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → a Date at UTC midnight, for persisting. */
export function fromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** A Date (or ISO string) → "HH:MM" using its UTC clock. */
export function toHm(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

/** A Date (or ISO string) → "YYYY-MM-DDTHH:MM" wall-clock stamp (UTC clock). */
export function toStamp(date: Date | string): string {
  return `${toYmd(date)}T${toHm(date)}`;
}

/** End-of-day sentinel time: a date-only deadline is "due by" this time. */
export const END_OF_DAY = "23:59";

/**
 * "YYYY-MM-DDTHH:MM" → a short label like "30 Jun" or "30 Jun · 14:00".
 * The time is omitted when it's the end-of-day sentinel (i.e. date-only).
 */
export function formatStamp(stamp: string, currentYear?: number): string {
  const [date, time] = stamp.split("T");
  const label = formatYmd(date, currentYear);
  return time && time !== END_OF_DAY ? `${label} · ${time}` : label;
}

/** "YYYY-MM-DD" → a short human label like "30 Jun" (year added if not current). */
export function formatYmd(ymd: string, currentYear?: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return currentYear != null && y !== currentYear ? `${base} ${y}` : base;
}
