import Link from "next/link";

/**
 * Segmented Week ⇄ Month switch for the dashboard. Plain links — the view is
 * carried in the `view` search param, so it survives reloads and is shareable.
 */
export function PeriodToggle({ view }: { view: "week" | "month" }) {
  return (
    <div className="mb-6 inline-flex items-center gap-1 self-start rounded-full border border-line bg-surface p-1">
      <ToggleLink href="/dashboard" active={view === "week"}>
        Week
      </ToggleLink>
      <ToggleLink href="/dashboard?view=month" active={view === "month"}>
        Month
      </ToggleLink>
    </div>
  );
}

function ToggleLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-brand text-white"
          : "text-muted-fg hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
