// Accounts that are never fined for a late or missing weekly submission. Two
// different reasons land here, and the exemption covers fines only — nothing on
// these accounts is hidden from the reporting stats or the admin review.
//
//  - alumni@freshman.academy is the shared graduates account: it can still set
//    goals like anyone else, but the Sunday 12:00 deadline doesn't apply to it.
//  - malika@freshman.academy reports weekly like everyone else and still counts
//    in the reporting stats; she is simply never fined for reporting late.
//
// Add more (comma-separated) via the SUBMISSION_EXEMPT_EMAILS env var.

const BUILT_IN_EXEMPT = [
  "alumni@freshman.academy",
  "malika@freshman.academy",
];

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
