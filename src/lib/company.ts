// Client-safe: what counts as a company account. Company sign-ups are trusted
// on sight; anyone else can sign up too but waits for approval (lib/approval).

export const COMPANY_EMAIL_DOMAIN = "freshman.academy";

/** Whether this email belongs to the company domain (case-insensitive). */
export function isCompanyEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${COMPANY_EMAIL_DOMAIN}`);
}
