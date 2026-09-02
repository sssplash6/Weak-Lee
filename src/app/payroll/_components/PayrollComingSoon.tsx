import Link from "next/link";
import { BackLink } from "@/app/_components/BackLink";

/**
 * The one screen every /payroll route renders while `PAYROLL_CLOSED` is on —
 * employees filing and both reviewer stages get the same message, so nobody
 * is left guessing whether their own view is broken.
 *
 * `panelLink` is the single exception: a global admin still reads the panel
 * while payroll is closed (see canReadPayrollWhileClosed), and the nav only
 * ever points at /payroll — so without a way through from here, the record
 * they are allowed to read would be reachable only by typing the URL.
 */
export function PayrollComingSoon({ panelLink = false }: { panelLink?: boolean }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-canvas px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">
          Payroll
        </div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-2xl">
          🧾
        </div>
        <h1 className="text-2xl font-bold text-ink">Coming soon</h1>
        <p className="mt-2 text-sm text-muted-fg">
          Payroll isn&rsquo;t open yet. Nothing is owed and nothing is late
          while it&rsquo;s closed — you&rsquo;ll hear from us when it&rsquo;s
          time to file.
        </p>

        {panelLink && (
          <p className="mt-4 text-sm text-muted-fg">
            You administer the app, so the{" "}
            <Link
              href="/payroll/panel"
              className="font-semibold text-brand hover:underline"
            >
              payroll panel
            </Link>{" "}
            stays open to you as a read-only record.
          </p>
        )}

        <div className="mt-6 flex justify-center">
          <BackLink href="/dashboard" label="Dashboard" />
        </div>
      </div>
    </main>
  );
}
