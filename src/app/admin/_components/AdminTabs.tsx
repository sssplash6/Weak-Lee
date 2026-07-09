import Link from "next/link";

export type AdminTab = "this" | "next" | "month";

/**
 * Top-level admin tabs. Plain links; the active tab rides in the `tab` search
 * param so it survives reloads and is shareable. "Goals" = the current week's
 * submitted goals; "Reports" = who has closed/reported their week.
 */
export function AdminTabs({ tab }: { tab: AdminTab }) {
  const TABS: { key: AdminTab; label: string; href: string }[] = [
    { key: "this", label: "Goals", href: "/admin" },
    { key: "next", label: "Reports", href: "/admin?tab=next" },
    { key: "month", label: "This month", href: "/admin?tab=month" },
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
