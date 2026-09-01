// Where the goal-submission control sits on a person's dashboard. Everyone
// gets it above their goal list; the accounts listed here asked for it under
// the list instead, so they read through the goals before hitting Submit.
// Purely cosmetic — the control, the deadline and the fines are identical
// either way. Add more (comma-separated) via the SUBMIT_AT_BOTTOM_EMAILS env
// var.

const BUILT_IN_BOTTOM_SUBMIT = ["banu@freshman.academy"];

/** Every email that wants the submit control below its goals, lowercased. */
export function submitAtBottomEmails(): string[] {
  const fromEnv = (process.env.SUBMIT_AT_BOTTOM_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...BUILT_IN_BOTTOM_SUBMIT, ...fromEnv])];
}

/** Whether this account's submit control goes below the goals (case-insensitive). */
export function submitsAtBottom(email: string | null | undefined): boolean {
  return !!email && submitAtBottomEmails().includes(email.toLowerCase());
}
