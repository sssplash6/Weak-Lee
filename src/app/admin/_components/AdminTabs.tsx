import Link from "next/link";

export type AdminTab = "current" | "previous" | "month" | "perf";

/**
 * Top-level admin tabs. Plain links; the active tab rides in the `tab` search
 * param so it survives reloads and is shareable. "Current week" = the goals
 * everyone owes for the week in progress; "Previous week" = last week's goals
 * and who closed out. The split flips at the Sunday 12:00 deadline.
 */
export function AdminTabs({ tab }: { tab: AdminTab }) {
  const TABS: { key: AdminTab; label: string; href: string }[] = [
    { key: "current", label: "Current week", href: "/admin" },
    { key: "previous", label: "Previous week", href: "/admin?tab=previous" },
    { key: "month", label: "This month", href: "/admin?tab=month" },
    { key: "perf", label: "Performance", href: "/admin?tab=perf" },
  ];
  return (
    <nav className="mb-6 flex gap-6 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={tab === t.key ? "page" : undefined}
          className={`-mb-px border-b-2 pb-2 text-sm font-semibold transition ${
            tab === t.key
              ? "border-brand text-ink"
              : "border-transparent text-muted-fg hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
