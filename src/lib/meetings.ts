// The team meets every Monday at 11:00 company time (Asia/Tashkent, UTC+5, no
// DST). These helpers resolve that weekly slot to a UTC instant so it's stored
// and compared unambiguously, regardless of the server's timezone.

const TASHKENT_OFFSET_MIN = 5 * 60;
const MEETING_HOUR = 11; // 11:00 Tashkent

/**
 * Monday 11:00 Asia/Tashkent of the week containing `date`, as a UTC instant.
 * Computed in Tashkent wall-clock terms, then shifted back to UTC.
 */
export function meetingSlotFor(date = new Date()): Date {
  // Shift so UTC getters read the Tashkent wall clock.
  const tash = new Date(date.getTime() + TASHKENT_OFFSET_MIN * 60_000);
  const day = tash.getUTCDay(); // 0 = Sun
  const sinceMonday = (day + 6) % 7;
  // Monday 11:00 in Tashkent wall-clock terms, expressed as a UTC instant…
  const wall = Date.UTC(
    tash.getUTCFullYear(),
    tash.getUTCMonth(),
    tash.getUTCDate() - sinceMonday,
    MEETING_HOUR,
    0,
    0,
    0,
  );
  // …then shift back to the real UTC instant.
  return new Date(wall - TASHKENT_OFFSET_MIN * 60_000);
}

/** The current week's meeting slot (Monday 11:00 Tashkent) as a UTC instant. */
export function currentMeetingSlot(): Date {
  return meetingSlotFor(new Date());
}
