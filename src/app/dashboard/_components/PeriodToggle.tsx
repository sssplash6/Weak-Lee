import Link from "next/link";

/**
 * Week ⇄ Month tabs. Plain links — the view is carried in the `view` search
 * param, so it survives reloads and is shareable. People in the daily-reports
 * loop (reporters and the recipient) get a third "Daily" tab that leads to
 * their side of /daily-reports; it's never the active tab here.
 */
export function PeriodToggle({
  view,
  basePath = "/dashboard",
  showDaily = false,
}: {
  view: "week" | "month";
  basePath?: string;
  showDaily?: boolean;
}) {
  return (
    <nav className="mb-6 flex gap-6 border-b border-line">
      {showDaily && (
        <Tab href="/daily-reports" active={false}>
          Daily
        </Tab>
      )}
      <Tab href={basePath} active={view === "week"}>
        Week
      </Tab>
      <Tab href={`${basePath}?view=month`} active={view === "month"}>
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
