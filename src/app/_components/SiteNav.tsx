"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/penalties", label: "Penalties" },
  { href: "/team", label: "The Team" },
  { href: "/notifications", label: "Notifications" },
];

// Pages with their own chrome — the dashboard's full header (bell + profile)
// and the bare auth/onboarding screens — don't get the nav bar.
const HIDDEN = new Set(["/", "/dashboard", "/signin", "/onboarding"]);

/**
 * A slim persistent nav for every page that isn't the dashboard. Until now
 * the only way off a subpage was "back to dashboard"; the bar makes the main
 * sections one click away from anywhere.
 */
export function SiteNav() {
  const pathname = usePathname();
  if (HIDDEN.has(pathname)) return null;

  return (
    <nav className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-5 overflow-x-auto px-4 py-2.5">
        <Link
          href="/dashboard"
          className="shrink-0 text-xs font-semibold uppercase tracking-widest text-brand transition hover:text-brand-dark"
        >
          freshman.academy
        </Link>
        <div className="flex items-center gap-4">
          {LINKS.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 text-sm transition ${
                  active
                    ? "font-semibold text-ink"
                    : "text-muted-fg hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
