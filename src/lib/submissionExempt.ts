// Accounts that are never fined for a late or missing weekly submission.
// alumni@freshman.academy is the shared graduates account: it can still set
// goals like anyone else, but the Sunday 12:00 deadline doesn't apply to it, so
// it is never fined for a missing or late submission. The exemption covers fines
// only — nothing on an exempt account is hidden from the reporting stats or the
// admin review. Add more (comma-separated) via the SUBMISSION_EXEMPT_EMAILS env
// var.

const BUILT_IN_EXEMPT = ["alumni@freshman.academy"];

/** Every email exempt from submission fines: built-ins plus env, lowercased. */
export function submissionExemptEmails(): string[] {
  const fromEnv = (process.env.SUBMISSION_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...BUILT_IN_EXEMPT, ...fromEnv])];
}

/** Whether this account is exempt from submission fines (case-insensitive). */
export function isSubmissionExempt(email: string | null | undefined): boolean {
  return !!email && submissionExemptEmails().includes(email.toLowerCase());
}
