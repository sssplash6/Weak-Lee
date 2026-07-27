"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { resolveAvatar } from "@/lib/avatar";
import { formatMoney, PENALTY_LABEL, type PenaltyType } from "@/lib/penalties";
import {
  SCORE_WEIGHTS,
  scoreBand,
  type EmployeePerformance,
  type PriorityKey,
  type RangeReport,
} from "@/lib/performance";
import {
  DivergingPair,
  Meter,
  RankedBars,
  ScoreDial,
  StackedBar,
  Swatch,
  TrendColumns,
  type Tone,
} from "./charts";

const PRIORITY_LABEL: Record<PriorityKey, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "No flag",
};

const ATTENDANCE_MARK: Record<string, { ch: string; tone: Tone; label: string }> = {
  ATTENDED: { ch: "A", tone: "good", label: "Attended" },
  LATE: { ch: "L", tone: "warn", label: "Late" },
  SKIPPED: { ch: "S", tone: "bad", label: "Skipped" },
  EXCUSED: { ch: "E", tone: "mute", label: "Excused" },
};

/**
 * One person's full performance card for the selected range, opened from the
 * Performance tab's table. Everything is grouped into a few labelled blocks —
 * identity and score first, then the score's own parts, then one block per
 * metric family — and a block that has nothing to say for this range says so in
 * a line instead of printing a wall of zeros.
 */
export function EmployeeReport({
  employee: e,
  report,
  onClose,
}: {
  employee: EmployeePerformance;
  report: RangeReport;
  onClose: () => void;
}) {
  // Close on Escape and lock body scroll while the card is open.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const avatar = resolveAvatar(e.avatar, e.email ?? e.id);
  const band = e.score != null ? scoreBand(e.score) : null;
  const team = report.team;

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${e.name} — performance`}
    >
      <div
        className="modal-in my-4 flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-surface shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* ---- identity + score */}
        <header className="flex shrink-0 items-start gap-4 border-b border-line p-5">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${avatar.bg}`}
            aria-hidden="true"
          >
            {avatar.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-ink">{e.name}</h2>
              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                {e.department?.trim() || "Unassigned"}
              </span>
              {band && (
                <ToneChip tone={band.tone}>{band.label}</ToneChip>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-muted-fg">
              {e.email ?? "no email"}
            </p>
            <p className="mt-1 text-xs text-muted-fg">
              {report.label} · {report.window}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-fg">
              {e.rank != null
                ? `Rank ${e.rank} of ${team.scored} scored${
                    e.deptRank != null
                      ? ` · #${e.deptRank} in ${e.department?.trim() || "Unassigned"}`
                      : ""
                  }`
                : "Not scored in this range"}
              {` · ${e.tenureWeeks} week${e.tenureWeeks === 1 ? "" : "s"} on the team`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <ScoreDial score={e.score} tone={band ? band.tone : "mute"} />
            {e.score != null && team.avgScore != null && (
              <Delta value={e.score - team.avgScore} suffix=" vs team" />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted-fg transition hover:bg-canvas hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          {/* ---- what the score is made of */}
          <Block
            title="Score breakdown"
            note={
              e.score == null
                ? "No completion history in this range, so there's no score."
                : "Weighted mix — completion is half of it."
            }
          >
            <ul className="flex flex-col gap-2.5">
              {SCORE_WEIGHTS.map(({ key, label, weight }) => (
                <li key={key}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-ink">
                      {label}
                      <span className="ml-1 text-muted-fg">
                        {Math.round(weight * 100)}%
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-ink">
                      {e.parts[key] != null ? `${e.parts[key]}%` : "—"}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Meter percent={e.parts[key]} label={`${label} ${e.parts[key] ?? "no data"}`} />
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          {/* ---- weekly completion over time */}
          <Block
            title="Weekly completion"
            note={
              e.trend.length > 1
                ? `Average ${e.goals.avgPercent != null ? `${e.goals.avgPercent}%` : "—"} across ${e.goals.weeksTracked} week${
                    e.goals.weeksTracked === 1 ? "" : "s"
                  }${e.goals.live ? " (week still open)" : ""}.`
                : e.trend.length === 1
                  ? `${e.trend[0].percent}% in this week${e.goals.live ? " so far" : ""}.`
                  : "No weeks with goals in this range."
            }
          >
            {e.trend.length > 1 ? (
              <>
                <TrendColumns
                  points={e.trend.map((p) => ({
                    label: p.label,
                    percent: p.percent,
                    note: `${p.goals} goal${p.goals === 1 ? "" : "s"}${
                      p.submitted ? (p.late ? " · submitted late" : " · on time") : " · not submitted"
                    }`,
                  }))}
                />
                {e.goals.best && e.goals.worst && (
                  <p className="mt-2 text-[11px] text-muted-fg">
                    {`Best ${e.goals.best.label} ${e.goals.best.percent}% · weakest ${e.goals.worst.label} ${e.goals.worst.percent}%`}
                  </p>
                )}
              </>
            ) : e.trend.length === 1 ? (
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold text-ink">
                  {e.trend[0].percent}%
                </span>
                <div className="min-w-0 flex-1">
                  <Meter percent={e.trend[0].percent} />
                  <p className="mt-1 text-[11px] text-muted-fg">
                    {`${e.trend[0].goals} goal${e.trend[0].goals === 1 ? "" : "s"} · ${
                      e.trend[0].submitted
                        ? e.trend[0].late
                          ? "submitted late"
                          : "submitted on time"
                        : "not submitted"
                    }`}
                  </p>
                </div>
              </div>
            ) : (
              <Empty>Nothing set in this range.</Empty>
            )}
          </Block>

          {/* ---- goals */}
          <Block
            title="Goals"
            note={
              e.goals.set > 0
                ? `${e.goals.done} of ${e.goals.set} finished · ${e.goals.subtasksDone}/${e.goals.subtasksTotal} subtasks ticked`
                : undefined
            }
          >
            {e.goals.set === 0 ? (
              <Empty>No goals in this range.</Empty>
            ) : (
              <>
                <RankedBars
                  rows={(["HIGH", "MEDIUM", "LOW", "NONE"] as PriorityKey[])
                    .filter((p) => e.goals.byPriority[p].set > 0)
                    .map((p) => {
                      const slot = e.goals.byPriority[p];
                      return {
                        key: p,
                        label: PRIORITY_LABEL[p],
                        value: Math.round((slot.done / slot.set) * 100),
                        sub: `${slot.done}/${slot.set} done`,
                      };
                    })}
                  suffix="%"
                  compact
                />
                <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[11px]">
                  <Row
                    label="Met their deadline"
                    value={
                      e.goals.withDeadline > 0
                        ? `${e.goals.metDeadline}/${e.goals.withDeadline}`
                        : "no deadlines set"
                    }
                  />
                  <Row
                    label="Reflections written"
                    value={
                      e.goals.needsReflection > 0
                        ? `${e.goals.reflected}/${e.goals.needsReflection}`
                        : "nothing unfinished"
                    }
                  />
                  <Row
                    label="Delegated out"
                    value={`${e.delegation.sharedOut}`}
                  />
                  <Row label="Taken on" value={`${e.delegation.received}`} />
                </dl>
              </>
            )}
          </Block>

          {/* ---- reporting discipline */}
          <Block
            title="Reporting"
            note="Goals are due by Sunday 12:00 Tashkent; the Monday 11:00 meeting is the hard stop."
          >
            {e.reporting.submitted === 0 ? (
              <Empty>Nothing submitted in this range.</Empty>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-ink">
                    {e.reporting.rate}%
                  </span>
                  <span className="text-xs text-muted-fg">on time</span>
                  {team.onTimeRate != null && e.reporting.rate != null && (
                    <Delta value={e.reporting.rate - team.onTimeRate} suffix=" vs team" />
                  )}
                </div>
                <div className="mt-2">
                  <StackedBar
                    segments={[
                      { label: "On time", value: e.reporting.onTime, tone: "good" },
                      { label: "Late", value: e.reporting.late, tone: "bad" },
                    ]}
                  />
                </div>
                {e.reporting.avgLeadHours != null && (
                  <p className="mt-2 text-[11px] text-muted-fg">
                    {e.reporting.avgLeadHours >= 0
                      ? `Submits ${e.reporting.avgLeadHours}h before the deadline on average.`
                      : `Submits ${Math.abs(e.reporting.avgLeadHours)}h after the deadline on average.`}
                  </p>
                )}
              </>
            )}
          </Block>

          {/* ---- meetings */}
          <Block title="Meetings" note="Late counts as present; excused doesn't count either way.">
            {e.meetings.attended +
              e.meetings.late +
              e.meetings.skipped +
              e.meetings.excused ===
            0 ? (
              <Empty>No meetings in this range.</Empty>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-ink">
                    {e.meetings.rate != null ? `${e.meetings.rate}%` : "—"}
                  </span>
                  <span className="text-xs text-muted-fg">attendance</span>
                  {team.attendanceRate != null && e.meetings.rate != null && (
                    <Delta
                      value={e.meetings.rate - team.attendanceRate}
                      suffix=" vs team"
                    />
                  )}
                </div>
                <div className="mt-2">
                  <StackedBar
                    segments={[
                      { label: "Attended", value: e.meetings.attended, tone: "good" },
                      { label: "Late", value: e.meetings.late, tone: "warn" },
                      { label: "Skipped", value: e.meetings.skipped, tone: "bad" },
                      { label: "Excused", value: e.meetings.excused, tone: "mute" },
                    ]}
                  />
                </div>
                {e.meetings.recent.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
                      Recent, newest first
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-1">
                      {e.meetings.recent.map((m, i) => {
                        const mark = ATTENDANCE_MARK[m.status];
                        return (
                          <li
                            key={`${m.label}-${i}`}
                            title={`${m.label} · ${mark.label}`}
                            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${
                              {
                                good: "bg-chart-good",
                                warn: "bg-chart-warn",
                                bad: "bg-chart-bad",
                                mute: "bg-chart-mute",
                                accent: "bg-accent",
                                brand: "bg-brand",
                              }[mark.tone]
                            }`}
                          >
                            {mark.ch}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Block>

          {/* ---- assigned work + daily focus */}
          <Block title="Assigned work" note="Admin-assigned tasks and the daily focus list. Neither counts toward the week percent.">
            {e.tasks.total === 0 && e.dayTasks.total === 0 ? (
              <Empty>Nothing assigned or planned in this range.</Empty>
            ) : (
              <dl className="flex flex-col gap-1.5 text-[11px]">
                <Row
                  label="Assigned tasks done"
                  value={
                    e.tasks.total > 0
                      ? `${e.tasks.done}/${e.tasks.total}${
                          e.tasks.rate != null ? ` · ${e.tasks.rate}%` : ""
                        }`
                      : "none"
                  }
                />
                <Row
                  label="Overdue right now"
                  value={`${e.tasks.overdue}`}
                  tone={e.tasks.overdue > 0 ? "bad" : undefined}
                />
                <Row
                  label="Finished by deadline"
                  value={e.tasks.done > 0 ? `${e.tasks.onTime}/${e.tasks.done}` : "—"}
                />
                <Row
                  label="Daily focus ticked"
                  value={
                    e.dayTasks.total > 0
                      ? `${e.dayTasks.done}/${e.dayTasks.total} over ${e.dayTasks.days} day${
                          e.dayTasks.days === 1 ? "" : "s"
                        }`
                      : "none set"
                  }
                />
              </dl>
            )}
          </Block>

          {/* ---- money */}
          <Block title="Bonuses & fines" note="Fines are what was issued in this range; outstanding is what's still unpaid.">
            {e.money.bonusCount === 0 && e.money.fineCount === 0 ? (
              <Empty>Clean slate in this range.</Empty>
            ) : (
              <>
                <DivergingPair
                  positive={e.money.bonusTotal}
                  negative={e.money.fineTotal}
                  positiveLabel="Bonuses"
                  negativeLabel="Fines"
                  format={formatMoney}
                />
                <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[11px]">
                  <Row
                    label="Net"
                    value={`${e.money.net >= 0 ? "+" : "−"}${formatMoney(Math.abs(e.money.net))}`}
                    tone={e.money.net >= 0 ? "good" : "bad"}
                  />
                  <Row
                    label="Still outstanding"
                    value={formatMoney(e.money.outstanding)}
                    tone={e.money.outstanding > 0 ? "bad" : undefined}
                  />
                  {(Object.keys(e.money.byType) as PenaltyType[])
                    .filter((t) => e.money.byType[t] > 0)
                    .map((t) => (
                      <Row
                        key={t}
                        label={PENALTY_LABEL[t]}
                        value={formatMoney(e.money.byType[t])}
                      />
                    ))}
                </dl>
              </>
            )}
          </Block>

          {/* ---- monthly goals, only when there are any */}
          {e.months.set > 0 && (
            <Block
              title="Monthly goals"
              note={`${e.months.done}/${e.months.set} finished across ${e.months.tracked} month${
                e.months.tracked === 1 ? "" : "s"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl font-semibold tabular-nums text-ink">
                  {e.months.avgPercent != null ? `${e.months.avgPercent}%` : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <Meter percent={e.months.avgPercent} />
                </div>
              </div>
            </Block>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ small parts

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-canvas p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
        {title}
      </h3>
      {note && <p className="mb-3 mt-0.5 text-[11px] text-muted-fg">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="min-w-0 truncate text-muted-fg">{label}</dt>
      <dd
        className={`shrink-0 font-semibold tabular-nums ${
          tone === "good"
            ? "text-chart-good"
            : tone === "bad"
              ? "text-chart-bad"
              : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-fg">{children}</p>;
}

function ToneChip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const cls = {
    good: "bg-chart-good/10 text-chart-good",
    warn: "bg-chart-warn/10 text-chart-warn",
    bad: "bg-chart-bad/10 text-chart-bad",
  }[tone];
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
    >
      <Swatch tone={tone} />
      {children}
    </span>
  );
}

/** A signed delta against the team average — direction, not decoration. */
function Delta({ value, suffix }: { value: number; suffix: string }) {
  const flat = value === 0;
  return (
    <span
      className={`text-[11px] font-semibold tabular-nums ${
        flat ? "text-muted-fg" : value > 0 ? "text-chart-good" : "text-chart-bad"
      }`}
    >
      {flat ? "±0" : `${value > 0 ? "+" : "−"}${Math.abs(value)}`}
      <span className="font-normal text-muted-fg">{suffix}</span>
    </span>
  );
}
