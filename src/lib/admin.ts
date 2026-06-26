// Server-only: which accounts may reach the admin panel. tech@freshman.academy
// is always an admin; add more (comma-separated) via the ADMIN_EMAILS env var.

const BUILT_IN_ADMINS = ["tech@freshman.academy"];

function adminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...BUILT_IN_ADMINS, ...fromEnv])];
}

/** Whether the given email is allowed into the admin panel (case-insensitive). */
export function isAdmin(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}
