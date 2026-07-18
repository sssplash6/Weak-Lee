import { resolveAvatar } from "@/lib/avatar";
import { formatMoney } from "@/lib/penalties";
import type { EmployeePerformance } from "@/lib/performance";

/**
 * Ranked per-employee performance cards for the admin Performance tab. Pure
 * server markup — every metric is precomputed in lib/performance.ts. Each card
 * is one person: identity + composite score up top, then one labeled block per
 * metric family so nothing competes for attention.
 */
export function PerformancePanel({
  employees,
}: {
  employees: EmployeePerformance[];
}) {
  if (employees.length === 0) {
    return <p className="px-1 text-sm text-muted-fg">No users yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {employees.map((e, i) => (
        <EmployeeCard key={e.id} employee={e} rank={i + 1} />
      ))}
    </ol>
  );
}

// Score bands — coarse on purpose; the number carries the detail.
function band(score: number): { label: string; className: string } {
  if (score >= 80)
    return { label: "Strong", className: "bg-green-50 text-green-700" };
  if (score >= 55)
    return { label: "Steady", className: "bg-amber-50 text-amber-700" };
  return { label: "Behind", className: "bg-red-50 text-red-600" };
}

function EmployeeCard({
  employee: e,
  rank,
}: {
  employee: EmployeePerformance;
  rank: number;
}) {
  const avatar = resolveAvatar(e.avatar, e.email ?? e.id);
  const scoreBand = e.score != null ? band(e.score) : null;

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-fg">
          {rank}
        </span>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${avatar.bg}`}
          aria-hidden="true"
        >
          {avatar.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
            <span className="truncate">{e.name ?? e.email ?? "—"}</span>
            {scoreBand && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${scoreBand.className}`}
              >
                {scoreBand.label}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-fg">
            {e.email ?? "no email"}
            {e.department ? ` · ${e.department}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {e.score != null ? (
            <>
              <div className="text-xl font-semibold tabular-nums text-ink">
                {e.score}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-fg">
                score
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-fg">Not scored yet</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="Weekly goals"
          value={e.weekly.avgPercent != null ? `${e.weekly.avgPercent}%` : "—"}
          percent={e.weekly.avgPercent}
          sub={
            e.weekly.tracked > 0
              ? `${e.weekly.goalsDone}/${e.weekly.goalsSet} goals · ${e.weekly.tracked} wk${e.weekly.tracked === 1 ? "" : "s"}`
              : "no closed weeks"
          }
        />
        <Metric
          label="Monthly goals"
          value={e.monthly.avgPercent != null ? `${e.monthly.avgPercent}%` : "—"}
          percent={e.monthly.avgPercent}
          sub={
            e.monthly.tracked > 0
              ? `${e.monthly.goalsDone}/${e.monthly.goalsSet} goals`
              : "no closed months"
          }
        />
        <Metric
          label="Meetings"
          value={e.meetings.rate != null ? `${e.meetings.rate}%` : "—"}
          percent={e.meetings.rate}
          sub={
            e.meetings.rate != null
              ? `${e.meetings.attended + e.meetings.late} of ${
                  e.meetings.attended + e.meetings.late + e.meetings.skipped
                } attended`
              : "no meetings yet"
          }
        />
        <Metric
          label="On-time reports"
          value={e.reporting.rate != null ? `${e.reporting.rate}%` : "—"}
          percent={e.reporting.rate}
          sub={
            e.reporting.submitted > 0
              ? `${e.reporting.onTime}/${e.reporting.submitted} weeks`
              : "nothing submitted"
          }
        />
        <Metric
          label="Assigned tasks"
          value={e.tasks.total > 0 ? `${e.tasks.done}/${e.tasks.total}` : "—"}
          percent={
            e.tasks.total > 0
              ? Math.round((e.tasks.done / e.tasks.total) * 100)
              : null
          }
          sub={e.tasks.total > 0 ? "completed" : "none assigned"}
        />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
            Bonuses · fines
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            <span className={e.money.net >= 0 ? "text-green-700" : "text-red-600"}>
              {e.money.net >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(e.money.net))}
            </span>
            <span className="ml-1 font-normal text-muted-fg">net</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-fg">
            {e.money.bonusCount > 0 || e.money.fineCount > 0
              ? `+${formatMoney(e.money.bonusTotal)} · −${formatMoney(e.money.fineTotal)}`
              : "clean slate"}
          </p>
        </div>
      </div>
    </li>
  );
}

// One labeled number with an optional thin progress bar underneath. The bar
// uses the accent (orange = progress) like every other completion bar.
function Metric({
  label,
  value,
  sub,
  percent,
}: {
  label: string;
  value: string;
  sub: string;
  percent: number | null;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{value}</p>
      {percent != null ? (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-line/40" />
      )}
      <p className="mt-1 truncate text-xs text-muted-fg">{sub}</p>
    </div>
  );
}
