// Onboarding profile fields collected after the first Google sign-in. A user
// must have all of these before they're allowed onto the dashboard.

export type ProfileFields = {
  name: string | null;
  workPhone: string | null;
  telegramUsername: string | null;
  department: string | null;
  birthday: Date | string | null;
};

/** True once every required onboarding field has a non-empty value. */
export function isProfileComplete(u: ProfileFields): boolean {
  const textOk = [u.name, u.workPhone, u.telegramUsername, u.department].every(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
  return textOk && u.birthday != null;
}

/** Normalize a Telegram handle: trim and drop a single leading "@". */
export function normalizeTelegram(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

/** Normalize an Instagram handle: trim and drop a single leading "@". */
export function normalizeInstagram(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

/** Normalize a LinkedIn value: just trim (users may paste a URL or a handle). */
export function normalizeLinkedin(value: string): string {
  return value.trim();
}
