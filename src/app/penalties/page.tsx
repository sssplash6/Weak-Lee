import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Penalties" };
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { resolveAvatar } from "@/lib/avatar";
import { formatDateTimeTz } from "@/lib/dates";
import { formatMoney } from "@/lib/penalties";
import { BackLink } from "@/app/_components/BackLink";
import { ReportForm } from "./_components/ReportForm";
import { PenaltyMatrix } from "./_components/PenaltyMatrix";
import { FineArchive, type ReceiptLine } from "./_components/FineArchive";
import { LedgerBar } from "./_components/LedgerBar";
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

  // Everyone can report a colleague, so everyone gets the roster.
  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, avatar: true },
  });

  // Who owes what across the team is admin-only, so only admins fetch it.
  const finedUsers = viewerIsAdmin
    ? await prisma.user.findMany({
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          avatar: true,
          penalties: {
            // Oldest first — the order a settlement is applied in, so every
            // list built from this reads in the same order money moves.
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              type: true,
              amount: true,
              paidAmount: true,
              note: true,
              createdAt: true,
              paidAt: true,
              payments: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  amount: true,
                  batchId: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      })
    : [];

  const reasonIndexOf = (type: string) => {
    const idx = REASONS.findIndex((r) => r.type === type);
    // Unknown types land in the "Other" column rather than crashing.
    return idx === -1 ? REASONS.length - 1 : idx;
  };

  // Build both sides of each person's ledger. Settling isn't all-or-nothing per
  // fine any more, so "active" and "settled" aren't two piles of fines: a fine
  // is open until its last dollar is paid, and the settled side is the payment
  // history — receipts, each spread over the fines it went to. Both are empty
  // for non-admins, who see their own fines on their dashboard instead.
  const built = finedUsers.map((u) => {
    const av = resolveAvatar(u.avatar, u.email ?? u.id);
    const open = u.penalties.filter((p) => p.paidAt == null);
    const owedOn = (p: { amount: number; paidAmount: number }) =>
      p.amount - p.paidAmount;

    const byType: Record<string, number> = {};
    for (const p of open) byType[p.type] = (byType[p.type] ?? 0) + owedOn(p);
    const outstanding = open.reduce((s, p) => s + owedOn(p), 0);
    // Money already sitting against fines that are still open — the part
    // payments. Distinct from `paid`, which counts everything ever settled.
    const partPaid = open.reduce((s, p) => s + p.paidAmount, 0);
    const paid = u.penalties.reduce((s, p) => s + p.paidAmount, 0);

    // Group every payment into the settlement it was part of. One settle action
    // writes one batch, however many fines it touched, so a batch is a receipt.
    const byBatch = new Map<
      string,
      { batchId: string; at: number; dateLabel: string; amount: number; lines: ReceiptLine[] }
    >();
    for (const p of u.penalties) {
      // A fine is closed by its final payment — that's the one that reads
      // "cleared" rather than "$20 of $60".
      const closing = p.paidAt != null ? p.payments.at(-1)?.id : undefined;
      for (const pay of p.payments) {
        const receipt = byBatch.get(pay.batchId) ?? {
          batchId: pay.batchId,
          at: pay.createdAt.getTime(),
          dateLabel: formatDateTimeTz(pay.createdAt),
          amount: 0,
          lines: [] as ReceiptLine[],
        };
        receipt.amount += pay.amount;
        receipt.lines.push({
          id: pay.id,
          reasonIndex: reasonIndexOf(p.type),
          note: p.note,
          amount: pay.amount,
          fineAmount: p.amount,
          cleared: pay.id === closing,
        });
        byBatch.set(pay.batchId, receipt);
      }
    }
    // Newest settlement first; `at` is only the sort key, so it's dropped here.
    const receipts = [...byBatch.values()]
      .sort((a, b) => b.at - a.at)
      .map((r) => ({
        batchId: r.batchId,
        dateLabel: r.dateLabel,
        amount: r.amount,
        lines: r.lines,
      }));

    return {
      id: u.id,
      name: u.name ?? u.email ?? "—",
      department: u.department,
      emoji: av.emoji,
      bg: av.bg,
      outstanding,
      partPaid,
      paid,
      clearedCount: u.penalties.filter((p) => p.paidAt != null).length,
      cells: REASONS.map((r) => byType[r.type] ?? 0),
      fines: open.map((p) => ({
        id: p.id,
        reasonIndex: reasonIndexOf(p.type),
        note: p.note,
        dateLabel: formatDateTimeTz(p.createdAt),
        amount: p.amount,
        paidAmount: p.paidAmount,
      })),
      receipts,
    };
  });

  // Active matrix: only people who still owe, heaviest first.
  const rows = built
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));

  // Settled: everyone who has paid something, most paid first.
  const archiveRows = built
    .filter((r) => r.receipts.length > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      department: r.department,
      emoji: r.emoji,
      bg: r.bg,
      paid: r.paid,
      clearedCount: r.clearedCount,
      stillOwed: r.outstanding,
      receipts: r.receipts,
    }))
    .sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name));

  const grandOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const grandPaid = built.reduce((s, r) => s + r.paid, 0);

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
          <h1 className="mt-1 text-2xl font-bold text-ink">Penalties</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {viewerIsAdmin
              ? "The penalty policy, everyone’s current fines, and a direct line to report a colleague."
              : "The penalty policy and a direct line to report a colleague. Your own fines are on your dashboard."}
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

      {viewerIsAdmin && (grandOutstanding > 0 || grandPaid > 0) && (
        <section className="mt-8">
          <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
            Where the team stands
          </h2>
          <LedgerBar settled={grandPaid} outstanding={grandOutstanding} />
        </section>
      )}

      {viewerIsAdmin && (
        <section className="mt-8">
          <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
            Active fines
          </h2>
          <p className="mb-3 px-1 text-xs text-muted-fg">
            Outstanding fines by reason — what each person still owes. Tap a
            person to see each fine. Settle any amount once it&rsquo;s been cut
            from their salary: it clears their oldest fines first, and whatever
            it doesn&rsquo;t cover stays here as a part-paid balance.
          </p>
          {rows.length > 0 ? (
            <PenaltyMatrix
              rows={rows}
              grandOutstanding={grandOutstanding}
              viewerIsAdmin={viewerIsAdmin}
            />
          ) : (
            <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center">
              <p className="text-sm font-semibold text-green-700">
                No outstanding fines 🎉
              </p>
              <p className="mt-1 text-xs text-muted-fg">
                Everyone&rsquo;s all settled up.
              </p>
            </div>
          )}
        </section>
      )}

      {viewerIsAdmin && archiveRows.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
            Settled
          </h2>
          <p className="mb-3 px-1 text-xs text-muted-fg">
            Every settlement recorded — cut from a salary and put against their
            fines. {formatMoney(grandPaid)} paid to date. Tap a person for the
            receipts; undo one and the fines it paid go back to outstanding.
          </p>
          <FineArchive rows={archiveRows} viewerIsAdmin={viewerIsAdmin} />
        </section>
      )}
    </div>
  );
}
