"use client";

import { useState } from "react";
import { resolveAvatar } from "@/lib/avatar";
import { formatMoney } from "@/lib/penalties";
import {
  scoreBand,
  type EmployeePerformance,
  type PerformanceReport,
  type RangeKey,
  type RangeReport,
} from "@/lib/performance";
import { EmployeeReport } from "./EmployeeReport";
import { Meter, RankedBars, Swatch, TrendColumns } from "./charts";

/** A percentage that may not exist yet — "83%" or a plain dash, never "—%". */
function rate(value: number | null): string {
  return value != null ? `${value}%` : "—";
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "previous", label: "Previous week" },
  { key: "current", label: "Current week" },
  { key: "all", label: "All time" },
];

/**
 * The Performance tab: one range at a time (previous week / current week / all
 * time), read as team numbers → department comparison → people, with a full
 * per-person card behind every row.
 *
 * All three ranges are computed server-side and shipped together, so switching
 * is instant and nothing re-queries. Metric definitions live in
 * lib/performance.ts; the chart primitives in ./charts.
 */
export function PerformancePanel({ report }: { report: PerformanceReport }) {
  const [range, setRange] = useState<RangeKey>("current");
  const [openId, setOpenId] = useState<string | null>(null);

  const active = report[range];
  const open = active.employees.find((e) => e.id === openId) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-line bg-surface p-0.5"
          role="tablist"
          aria-label="Performance range"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                range === r.key
                  ? "bg-brand text-white"
                  : "text-muted-fg hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-fg">{active.window}</p>
      </div>

      <TeamStrip report={active} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title={range === "all" ? "Team completion by week" : "Completion by person"}
          note={
            range === "all"
              ? "Average of everyone's week percent, oldest week first."
              : "Each person's completion for this week."
          }
        >
          {range === "all" ? (
            active.trend.length > 0 ? (
              <TrendColumns points={active.trend.slice(-12)} height={120} />
            ) : (
              <Empty>No weeks with goals yet.</Empty>
            )
          ) : active.employees.some((e) => e.goals.avgPercent != null) ? (
            <RankedBars
              rows={active.employees
                .filter((e) => e.goals.avgPercent != null)
                // Highest first — a ranked chart is sorted by what it plots,
                // not by the table's score order.
                .sort((a, b) => (b.goals.avgPercent ?? 0) - (a.goals.avgPercent ?? 0))
                .map((e) => ({
                  key: e.id,
                  label: e.name,
                  value: e.goals.avgPercent,
                  sub: `${e.goals.done}/${e.goals.set} goals`,
                }))}
              suffix="%"
            />
          ) : (
            <Empty>Nobody has goals in this week yet.</Empty>
          )}
        </Panel>

        <Panel
          title="By department"
          note="Average score per department; the bar length is the score."
        >
          {active.departments.length > 0 ? (
            <>
              <RankedBars
                rows={active.departments.map((d) => ({
                  key: d.name,
                  label: d.name,
                  value: d.avgScore,
                  sub: `${d.headcount} ${d.headcount === 1 ? "person" : "people"}`,
                }))}
              />
              <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[11px]">
                {active.departments.map((d) => (
                  <div key={d.name} className="flex items-baseline gap-2">
                    <dt className="w-28 shrink-0 truncate text-ink">{d.name}</dt>
                    <dd className="min-w-0 flex-1 truncate text-muted-fg">
                      {[
                        `${rate(d.avgCompletion)} completion`,
                        `${rate(d.attendanceRate)} meetings`,
                        `${rate(d.onTimeRate)} on time`,
                        `${d.goalsDone}/${d.goalsSet} goals`,
                      ].join(" · ")}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <Empty>No people yet.</Empty>
          )}
        </Panel>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h3 className="text-sm font-semibold text-ink">
            People ({active.employees.length})
          </h3>
          <p className="text-xs text-muted-fg">
            Click anyone for their full card. Ranked by score inside each
            department.
          </p>
        </div>

        {active.employees.length === 0 ? (
          <Empty>No users yet.</Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {active.departments.map((d) => (
              <div key={d.name}>
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink">
                    {d.name}
                  </h4>
                  <span className="text-[11px] text-muted-fg">
                    {`${d.headcount} ${d.headcount === 1 ? "person" : "people"} · score ${
                      d.avgScore ?? "—"
                    } · ${rate(d.avgCompletion)} completion`}
                  </span>
                </div>
                <PeopleTable
                  people={active.employees.filter(
                    (e) => (e.department?.trim() || "Unassigned") === d.name,
                  )}
                  onOpen={setOpenId}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {open && (
        <EmployeeReport
          employee={open}
          report={active}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/** The range's headline numbers, as one quiet strip between hairlines. */
function TeamStrip({ report }: { report: RangeReport }) {
  const t = report.team;
  const stats: { label: string; value: string | number }[] = [
    { label: "Team score", value: t.avgScore ?? "—" },
    { label: "Avg completion", value: t.avgCompletion != null ? `${t.avgCompletion}%` : "—" },
    { label: "Attendance", value: t.attendanceRate != null ? `${t.attendanceRate}%` : "—" },
    { label: "On-time reports", value: t.onTimeRate != null ? `${t.onTimeRate}%` : "—" },
    { label: "Goals done", value: `${t.goalsDone}/${t.goalsSet}` },
    { label: "Assigned tasks", value: `${t.tasksDone}/${t.tasksTotal}` },
    { label: "Bonuses", value: formatMoney(t.bonusTotal) },
    { label: "Fines", value: formatMoney(t.fineTotal) },
  ];
  return (
    <section className="mt-4 flex flex-wrap gap-x-8 gap-y-4 border-y border-line px-1 py-4">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="text-xl font-semibold text-ink">{s.value}</div>
          <div className="mt-0.5 text-xs text-muted-fg">{s.label}</div>
        </div>
      ))}
    </section>
  );
}

// The row grid: rank · person · score · completion · meetings · on-time · net.
// Columns drop away on narrow screens rather than squeezing.
const ROW =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_3rem] items-center gap-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_3rem_6rem_4rem] lg:grid-cols-[1.75rem_minmax(0,1fr)_3rem_7rem_4rem_4rem_5rem]";

function PeopleTable({
  people,
  onOpen,
}: {
  people: EmployeePerformance[];
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <div
        className={`${ROW} px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-fg`}
        aria-hidden="true"
      >
        <span className="text-center">#</span>
        <span>Person</span>
        <span className="text-right">Score</span>
        <span className="hidden sm:block">Completion</span>
        <span className="hidden text-right sm:block">Meetings</span>
        <span className="hidden text-right lg:block">On time</span>
        <span className="hidden text-right lg:block">Net</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {people.map((e) => (
          <li key={e.id}>
            <PersonRow employee={e} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonRow({
  employee: e,
  onOpen,
}: {
  employee: EmployeePerformance;
  onOpen: (id: string) => void;
}) {
  const avatar = resolveAvatar(e.avatar, e.email ?? e.id);
  const band = e.score != null ? scoreBand(e.score) : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(e.id)}
      aria-label={`Open ${e.name}'s performance card`}
      className={`${ROW} w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition hover:border-brand/40 hover:bg-canvas`}
    >
      <span className="text-center text-xs font-semibold tabular-nums text-muted-fg">
        {e.rank ?? "—"}
      </span>

      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${avatar.bg}`}
          aria-hidden="true"
        >
          {avatar.emoji}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">
              {e.name}
            </span>
            {band && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-fg">
                <Swatch tone={band.tone} />
                {band.label}
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-muted-fg">
            {e.goals.set > 0
              ? `${e.goals.done}/${e.goals.set} goals · ${e.goals.subtasksDone}/${e.goals.subtasksTotal} subtasks`
              : "no goals in range"}
            {e.tasks.overdue > 0 ? ` · ${e.tasks.overdue} overdue` : ""}
          </span>
        </span>
      </span>

      <span className="text-right text-sm font-semibold tabular-nums text-ink">
        {e.score ?? "—"}
      </span>

      <span className="hidden sm:block">
        <Meter
          percent={e.goals.avgPercent}
          label={`Completion ${e.goals.avgPercent ?? "no data"}`}
        />
        <span className="mt-1 block text-[10px] tabular-nums text-muted-fg">
          {e.goals.avgPercent != null
            ? `${e.goals.avgPercent}%${e.goals.live ? " so far" : ""}`
            : "—"}
        </span>
      </span>

      <span className="hidden text-right text-xs tabular-nums text-ink sm:block">
        {e.meetings.rate != null ? `${e.meetings.rate}%` : "—"}
      </span>

      <span className="hidden text-right text-xs tabular-nums text-ink lg:block">
        {e.reporting.rate != null ? `${e.reporting.rate}%` : "—"}
      </span>

      <span
        className={`hidden text-right text-xs font-semibold tabular-nums lg:block ${
          e.money.net > 0
            ? "text-chart-good"
            : e.money.net < 0
              ? "text-chart-bad"
              : "text-muted-fg"
        }`}
      >
        {e.money.net === 0
          ? "—"
          : `${e.money.net > 0 ? "+" : "−"}${formatMoney(Math.abs(e.money.net))}`}
      </span>
    </button>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted-fg">{note}</p>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-sm text-muted-fg">{children}</p>;
}
