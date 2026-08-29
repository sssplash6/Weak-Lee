import Link from "next/link";

/**
 * The header's "someone wants in" button, beside the bell — and only there
 * when someone actually does. A door with an arrow into it: this is a person
 * at the door of a department, not a notification about one.
 *
 * It exists because the sign-up alert is one line in a feed that scrolls: a
 * request to join YOUR department is the rare notification that is addressed
 * to you personally and blocks someone else until you act, so it gets a
 * standing button rather than a place in the queue of updates. Rendering
 * nothing at zero is the whole point — the header stays as it was for the
 * many days nobody is waiting.
 *
 * A server component: it holds no state and links straight to the queue the
 * viewer can act in (/department for a lead, /admin for an admin, matching
 * where the sign-up alert already sends each of them).
 *
 * Colour: the accent tokens, which are what /payroll and the waiting-for-
 * approval panel already use for "this is waiting on you" — and, being
 * tokens, they re-step for the dark theme instead of glowing on it the way a
 * raw amber wash would. The count badge stays the bell's red, because a red
 * dot in this header already means "unread, look here" and two different
 * badge colours side by side would invent a distinction nobody asked for.
 */
export function SignupRequestsButton({
  count,
  summary,
  href,
}: {
  count: number;
  summary: string;
  href: string;
}) {
  if (count < 1) return null;
  return (
    <Link
      href={href}
      title={summary}
      aria-label={summary}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent-ink transition hover:ring-2 hover:ring-accent/30"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        {/* Door, with someone stepping through it. */}
        <path d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4" />
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
      </svg>
      <span
        className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
        aria-hidden="true"
      >
        {count > 9 ? "9+" : count}
      </span>
    </Link>
  );
}
