import Link from "next/link";

/**
 * Week ⇄ Month tabs for the dashboard. Plain links — the view is carried in
 * the `view` search param, so it survives reloads and is shareable.
 */
export function PeriodToggle({ view }: { view: "week" | "month" }) {
  return (
    <nav className="mb-6 flex gap-6 border-b border-line">
      <Tab href="/dashboard" active={view === "week"}>
        Week
      </Tab>
      <Tab href="/dashboard?view=month" active={view === "month"}>
        Month
      </Tab>
    </nav>
  );
}

function Tab({
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
      className={`-mb-px border-b-2 pb-2 text-sm font-semibold transition ${
        active
          ? "border-brand text-ink"
          : "border-transparent text-muted-fg hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
