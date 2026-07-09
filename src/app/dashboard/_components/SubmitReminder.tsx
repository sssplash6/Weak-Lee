/**
 * Full-width amber alert pinned above the dashboard, shown on every visit
 * until the current period's goals have been submitted at least once
 * (submittedAt set). Points at the Submit control further down the page.
 */
export function SubmitReminder({ scope }: { scope: "week" | "month" }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2.5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-amber-500"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <p className="text-sm text-amber-800">
          <span className="font-semibold">
            Your goals for this {scope} aren&rsquo;t submitted yet
          </span>{" "}
          — don&rsquo;t forget to hit the Submit button below.
        </p>
      </div>
    </div>
  );
}
