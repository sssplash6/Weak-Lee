import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { resolveAvatar } from "@/lib/avatar";
import { formatDateTimeTz } from "@/lib/dates";
import { BackLink } from "@/app/_components/BackLink";
import { ReportForm } from "./_components/ReportForm";
import { PenaltyMatrix } from "./_components/PenaltyMatrix";
import { REASONS } from "./reasons";

// The written penalty policy, digitized from the company sheet. Amounts here
// are the policy; the matrix below is what's actually been issued.
const POLICY: {
  title: string;
  scope: string;
  edge: string;
  heading: string;
  chip: string;
  rows: { label: string; amount: string; emphasis?: boolean }[];
  note: string | null;
}[] = [
  {
    title: "Absences",
    scope: "Only department leaders",
    edge: "border-t-red-400",
    heading: "text-red-700",
    chip: "bg-red-50 text-red-700",
    rows: [
      { label: "1st absence", amount: "$40" },
      { label: "2nd absence in a row", amount: "$60" },
      { label: "3rd absence in a row", amount: "$80" },
      { label: "Every consecutive absence", amount: "plus $20", emphasis: true },
    ],
    note: null,
  },
  {
    title: "Late attendance",
    scope: "Only department leaders",
    edge: "border-t-orange-400",
    heading: "text-orange-700",
    chip: "bg-orange-50 text-orange-700",
    rows: [
      { label: "Up to 10 minutes", amount: "$20" },
      { label: "10 to 20 minutes", amount: "$30" },
      { label: "20+ minutes", amount: "Absence", emphasis: true },
    ],
    note: null,
  },
  {
    title: "Weekly goals & reports",
    scope: "Only department leaders",
    edge: "border-t-brand",
    heading: "text-brand",
    chip: "bg-brand-soft text-brand",
    rows: [
      { label: "Late submission", amount: "$20" },
      { label: "Non-submission", amount: "$40" },
    ],
    note: "You need to submit BOTH goals and report to avoid a penalty.",
  },
  {
    title: "Communication",
    scope: "All team members",
    edge: "border-t-violet-400",
    heading: "text-violet-700",
    chip: "bg-violet-50 text-violet-700",
    rows: [
      { label: "No response within 2 business days (Mon–Fri)", amount: "$10" },
    ],
    note: "How to report: use the form above, or send a screenshot of the unanswered message to Shakhzod directly (TG kodirovshakhzod).",
  },
];

export default async function PenaltiesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const viewerIsAdmin = isAdmin(session.user.email);

  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      avatar: true,
      finesPaid: true,
      penalties: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          amount: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });

  // One matrix row per employee: their issued fines summed per reason, plus
  // the individual fines behind the sums (shown when the row is expanded).
  // Heaviest totals first so the table leads with what needs attention.
  const rows = users
    .map((u) => {
      const av = resolveAvatar(u.avatar, u.email ?? u.id);
      const byType: Record<string, number> = {};
      for (const p of u.penalties) {
        byType[p.type] = (byType[p.type] ?? 0) + p.amount;
      }
      const total = u.penalties.reduce((s, p) => s + p.amount, 0);
      return {
        id: u.id,
        name: u.name ?? u.email ?? "—",
        department: u.department,
        emoji: av.emoji,
        bg: av.bg,
        cells: REASONS.map((r) => byType[r.type] ?? 0),
        total,
        // Never show more paid than owed, even if a fine was deleted after payment.
        paid: Math.min(u.finesPaid, total),
        fines: u.penalties.map((p) => {
          const idx = REASONS.findIndex((r) => r.type === p.type);
          return {
            id: p.id,
            // Unknown types land in the "Other" column rather than crashing.
            reasonIndex: idx === -1 ? REASONS.length - 1 : idx,
            note: p.note,
            dateLabel: formatDateTimeTz(p.createdAt),
            amount: p.amount,
          };
        }),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandPaid = rows.reduce((s, r) => s + r.paid, 0);
  const grandOutstanding = Math.max(0, grandTotal - grandPaid);

  const colleagues = users
    .filter((u) => u.id !== session.user.id)
    .map((u) => {
      const av = resolveAvatar(u.avatar, u.email ?? u.id);
      return { id: u.id, name: u.name ?? u.email ?? "—", emoji: av.emoji, bg: av.bg };
    });

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Penalties</h1>
          <p className="mt-1 text-sm text-muted-fg">
            The penalty policy, everyone&rsquo;s current fines, and a direct
            line to report a colleague.
          </p>
        </div>
        <BackLink href="/dashboard" label="Dashboard" />
      </header>

      <ReportForm colleagues={colleagues} />

      <section className="mt-8">
        <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
          Penalty policy
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {POLICY.map((p) => (
            <div
              key={p.title}
              className={`rounded-xl border border-line border-t-2 bg-surface p-4 ${p.edge}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className={`text-sm font-bold ${p.heading}`}>{p.title}</h3>
                <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
                  {p.scope}
                </span>
              </div>
              <ul className="mt-3 flex flex-col">
                {p.rows.map((r) => (
                  <li
                    key={r.label}
                    className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm first:border-t-0"
                  >
                    <span
                      className={
                        r.emphasis ? "italic text-muted-fg" : "text-ink"
                      }
                    >
                      {r.label}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${p.chip}`}
                    >
                      {r.amount}
                    </span>
                  </li>
                ))}
              </ul>
              {p.note && (
                <p className="mt-2 border-t border-line pt-2 text-xs italic text-muted-fg">
                  {p.note}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 px-1 text-xs text-muted-fg">
          Exceptions apply for legitimate excuses — illness, bereavement, a
          genuine emergency.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
          Current penalties
        </h2>
        <p className="mb-3 px-1 text-xs text-muted-fg">
          Everyone&rsquo;s issued fines to date, by reason. Tap a person to see
          each fine and why it was issued.
        </p>
        <PenaltyMatrix
          rows={rows}
          grandTotal={grandTotal}
          grandOutstanding={grandOutstanding}
          viewerIsAdmin={viewerIsAdmin}
        />
      </section>
    </div>
  );
}
