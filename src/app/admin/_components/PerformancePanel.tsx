"use client";

import { useState } from "react";
import { resolveAvatar } from "@/lib/avatar";
import { formatMoney } from "@/lib/penalties";
import {
  scoreBand,
  type DepartmentPerformance,
  type EmployeePerformance,
  type PerformanceReport,
  type RangeKey,
  type RangeReport,
} from "@/lib/performance";
import { DepartmentReport } from "./DepartmentReport";
import { EmployeeReport } from "./EmployeeReport";
import { Meter, RankedBars, TrendColumns } from "./charts";
import { TONE_TEXT } from "./reportBits";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "previous", label: "Previous week" },
  { key: "current", label: "Current week" },
  { key: "all", label: "All time" },
];

/** "83%", or a plain dash when there's nothing to show — never "—%". */
function rate(value: number | null): string {
  return value != null ? `${value}%` : "—";
}

/**
 * The Performance tab: one range at a time (previous week / current week / all
 * time), read as team numbers → department comparison → people. Every row is a
 * way in: a department opens the department's pooled card, a person opens
 * theirs.
 *
 * All three ranges are computed server-side and shipped together, so switching
 * is instant. Metric definitions live in lib/performance.ts, chart primitives
 * in ./charts.
 */
export function PerformancePanel({ report }: { report: PerformanceReport }) {
  const [range, setRange] = useState<RangeKey>("current");
  const [personId, setPersonId] = useState<string | null>(null);
  const [deptName, setDeptName] = useState<string | null>(null);

  const active = report[range];
  const person = active.employees.find((e) => e.id === personId) ?? null;
  const department = active.departments.find((d) => d.name === deptName) ?? null;

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
        <p className="text-xs tabular-nums text-muted-fg">{active.window}</p>
      </div>

      <TeamStrip report={active} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title={range === "all" ? "Completion by week" : "Completion by person"}>
          {range === "all" ? (
            active.trend.length > 0 ? (
              <TrendColumns points={active.trend.slice(-12)} height={132} />
            ) : (
              <Empty>No weeks with goals yet.</Empty>
            )
          ) : active.employees.some((e) => e.goals.avgPercent != null) ? (
            <RankedBars
              rows={active.employees
                .filter((e) => e.goals.avgPercent != null)
                // Highest first — a ranked chart is sorted by what it plots.
                .sort((a, b) => (b.goals.avgPercent ?? 0) - (a.goals.avgPercent ?? 0))
                .map((e) => ({
                  key: e.id,
                  label: e.name,
                  value: e.goals.avgPercent,
                }))}
              suffix="%"
            />
          ) : (
            <Empty>No goals set this week yet.</Empty>
          )}
        </Panel>

        <Panel title="Score by department">
          {active.departments.length > 0 ? (
            <RankedBars
              rows={active.departments.map((d) => ({
                key: d.name,
                label: d.name,
                value: d.avgScore,
                sub: `${d.headcount}`,
              }))}
            />
          ) : (
            <Empty>No people yet.</Empty>
          )}
        </Panel>
      </div>

      <section className="mt-8">
        <h3 className="mb-2 px-3 text-sm font-semibold text-ink">
          People ({active.employees.length})
        </h3>

        {active.employees.length === 0 ? (
          <Empty>No users yet.</Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div
              className={`${ROW} border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-fg`}
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

            {active.departments.map((d) => (
              <div key={d.name}>
                <DepartmentRow
                  department={d}
                  onOpen={() => setDeptName(d.name)}
                />
                <ul>
                  {active.employees
                    .filter((e) => (e.department?.trim() || "Unassigned") === d.name)
                    .map((e) => (
                      <li key={e.id} className="border-t border-line/60">
                        <PersonRow employee={e} onOpen={setPersonId} />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {department && (
        <DepartmentReport
          department={department}
          report={active}
          onClose={() => setDeptName(null)}
          onOpenPerson={(id) => {
            setDeptName(null);
            setPersonId(id);
          }}
        />
      )}

      {person && (
        <EmployeeReport
          employee={person}
          report={active}
          onClose={() => setPersonId(null)}
        />
      )}
    </div>
  );
}

/** The range's headline numbers, as one quiet strip between hairlines. */
function TeamStrip({ report }: { report: RangeReport }) {
  const t = report.team;
  const stats: { label: string; value: string | number; tone?: string }[] = [
    { label: "Team score", value: t.avgScore ?? "—" },
    { label: "Completion", value: rate(t.avgCompletion) },
    { label: "Meetings", value: rate(t.attendanceRate) },
    { label: "On time", value: rate(t.onTimeRate) },
    { label: "Goals", value: `${t.goalsDone}/${t.goalsSet}` },
    { label: "Tasks", value: `${t.tasksDone}/${t.tasksTotal}` },
    {
      label: "Bonuses",
      value: formatMoney(t.bonusTotal),
      tone: t.bonusTotal > 0 ? TONE_TEXT.good : undefined,
    },
    {
      label: "Fines",
      value: formatMoney(t.fineTotal),
      tone: t.fineTotal > 0 ? TONE_TEXT.bad : undefined,
    },
  ];
  return (
    <section className="mt-4 flex flex-wrap gap-x-8 gap-y-4 border-y border-line px-3 py-4">
      {stats.map((s) => (
        <div key={s.label}>
          <div
            className={`text-xl font-semibold tabular-nums ${s.tone ?? "text-ink"}`}
          >
            {s.value}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-fg">{s.label}</div>
        </div>
      ))}
    </section>
  );
}

// One grid for the header, the department rows and the people rows, so every
// column lines up down the whole table. Columns drop away on narrow screens
// rather than squeezing.
const ROW =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_2.75rem] items-center gap-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_6rem_4rem] lg:grid-cols-[1.5rem_minmax(0,1fr)_2.75rem_7rem_4rem_4rem_5rem]";

/** A score as a tinted chip — the number is the label, the tint is the band. */
function ScoreChip({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="block text-right text-xs text-muted-fg tabular-nums">—</span>
    );
  }
  const tone = scoreBand(score).tone;
  const cls = {
    good: "bg-chart-good/12 text-chart-good",
    warn: "bg-chart-warn/12 text-chart-warn",
    bad: "bg-chart-bad/12 text-chart-bad",
  }[tone];
  return (
    <span
      className={`ml-auto flex h-7 w-11 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${cls}`}
      title={`Score ${score} — ${scoreBand(score).label}`}
    >
      {score}
    </span>
  );
}

function DepartmentRow({
  department: d,
  onOpen,
}: {
  department: DepartmentPerformance;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open the ${d.name} department card`}
      className={`${ROW} w-full border-t border-line bg-canvas px-3 py-2 text-left transition hover:bg-brand-soft`}
    >
      <span className="flex justify-center text-muted-fg" aria-hidden="true">
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-xs font-bold uppercase tracking-wide text-ink">
          {d.name}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-fg">
          {d.headcount}
        </span>
      </span>
      <ScoreChip score={d.avgScore} />
      <span className="hidden sm:block">
        <Meter percent={d.avgCompletion} label={`Completion ${d.avgCompletion ?? "no data"}`} />
      </span>
      <span className="hidden text-right text-xs tabular-nums text-muted-fg sm:block">
        {rate(d.attendanceRate)}
      </span>
      <span className="hidden text-right text-xs tabular-nums text-muted-fg lg:block">
        {rate(d.onTimeRate)}
      </span>
      <span className="hidden text-right text-xs tabular-nums text-muted-fg lg:block">
        {d.money.net === 0
          ? "—"
          : `${d.money.net > 0 ? "+" : "−"}${formatMoney(Math.abs(d.money.net))}`}
      </span>
    </button>
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

  return (
    <button
      type="button"
      onClick={() => onOpen(e.id)}
      aria-label={`Open ${e.name}'s performance card`}
      className={`${ROW} w-full px-3 py-2.5 text-left transition hover:bg-canvas`}
    >
      <span className="text-center text-xs tabular-nums text-muted-fg">
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
          <span className="block truncate text-sm font-semibold text-ink">
            {e.name}
          </span>
          <span className="block truncate text-[11px] text-muted-fg">
            {e.goals.set > 0
              ? `${e.goals.done}/${e.goals.set} goals · ${e.goals.subtasksDone}/${e.goals.subtasksTotal} subtasks`
              : "no goals in range"}
            {e.tasks.overdue > 0 && (
              <span className={TONE_TEXT.bad}>
                {` · ${e.tasks.overdue} overdue`}
              </span>
            )}
          </span>
        </span>
      </span>

      <ScoreChip score={e.score} />

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
        {rate(e.meetings.rate)}
      </span>

      <span className="hidden text-right text-xs tabular-nums lg:block">
        <span className={e.reporting.missed > 0 ? TONE_TEXT.bad : "text-ink"}>
          {rate(e.reporting.rate)}
        </span>
        {e.reporting.missed > 0 && (
          <span className={`block text-[10px] ${TONE_TEXT.bad}`}>
            {`${e.reporting.missed} missed`}
          </span>
        )}
      </span>

      <span
        className={`hidden text-right text-xs font-semibold tabular-nums lg:block ${
          e.money.net > 0
            ? TONE_TEXT.good
            : e.money.net < 0
              ? TONE_TEXT.bad
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 text-sm text-muted-fg">{children}</p>;
}
