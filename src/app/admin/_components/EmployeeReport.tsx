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
  TrendColumns,
  type Tone,
} from "./charts";
import { Block, CardShell, Delta, Empty, Row, ToneChip } from "./reportBits";

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

const MARK_BG: Record<Tone, string> = {
  good: "bg-chart-good",
  warn: "bg-chart-warn",
  bad: "bg-chart-bad",
  mute: "bg-chart-mute",
  accent: "bg-accent",
  brand: "bg-brand",
};

/**
 * One person's card for the selected range, opened from the Performance table.
 * Identity and score first, then one block per metric family. A block with
 * nothing to say for the range says so in a line rather than printing zeros.
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
  const dept = e.department?.trim() || "Unassigned";
  const meetingsSeen =
    e.meetings.attended + e.meetings.late + e.meetings.skipped + e.meetings.excused;

  return createPortal(
    <CardShell
      label={`${e.name} — performance`}
      onClose={onClose}
      header={
        <>
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
                {dept}
              </span>
              <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-fg">
                {e.lead ? "Dep. lead" : "Member"}
              </span>
              {band && <ToneChip tone={band.tone}>{band.label}</ToneChip>}
            </div>
            <p className="mt-1.5 truncate text-xs text-muted-fg">
              {[
                report.window,
                e.rank != null ? `#${e.rank} of ${team.scored}` : "unscored",
                e.deptRank != null
                  ? `#${e.deptRank} in ${e.departments[0] ?? dept}`
                  : null,
                `${e.tenureWeeks}w on the team`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <ScoreDial score={e.score} tone={band ? band.tone : "mute"} />
            {e.score != null && team.avgScore != null && (
              <Delta value={e.score - team.avgScore} suffix=" vs team" />
            )}
          </div>
        </>
      }
    >
      {/* ---- the score's parts */}
      <Block title="Score breakdown">
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
              <div className="mt-1.5">
                <Meter
                  percent={e.parts[key]}
                  label={`${label} ${e.parts[key] ?? "no data"}`}
                />
              </div>
            </li>
          ))}
        </ul>
      </Block>

      {/* ---- weekly completion */}
      <Block title="Weekly completion">
        {e.trend.length > 1 ? (
          <>
            <TrendColumns
              points={e.trend.map((p) => ({
                label: p.label,
                percent: p.percent,
                note: `${p.goals} goal${p.goals === 1 ? "" : "s"}${
                  p.submitted
                    ? p.late
                      ? " · late"
                      : " · on time"
                    : " · not submitted"
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
              <p className="mt-1.5 text-[11px] text-muted-fg">
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
          <Empty>No weeks with goals in this range.</Empty>
        )}
      </Block>

      {/* ---- goals */}
      <Block title="Goals">
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
                    sub: `${slot.done}/${slot.set}`,
                  };
                })}
              suffix="%"
              compact
            />
            <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[11px]">
              <Row label="Finished" value={`${e.goals.done}/${e.goals.set}`} />
              <Row
                label="Subtasks ticked"
                value={`${e.goals.subtasksDone}/${e.goals.subtasksTotal}`}
              />
              <Row
                label="Met the deadline"
                value={
                  e.goals.withDeadline > 0
                    ? `${e.goals.metDeadline}/${e.goals.withDeadline}`
                    : "none set"
                }
              />
              <Row
                label="Reflections written"
                value={
                  e.goals.needsReflection > 0
                    ? `${e.goals.reflected}/${e.goals.needsReflection}`
                    : "—"
                }
              />
              <Row
                label="Delegated out · taken on"
                value={`${e.delegation.sharedOut} · ${e.delegation.received}`}
              />
            </dl>
          </>
        )}
      </Block>

      {/* ---- reporting */}
      <Block
        title="Reporting"
        note="Every week owed counts; one never submitted is a miss."
      >
        {e.reporting.expected === 0 ? (
          <Empty>
            {e.lead
              ? "No report was due in this range."
              : "Members don't owe weekly reports — only department leads do."}
          </Empty>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {e.reporting.rate}%
              </span>
              <span className="text-xs text-muted-fg">
                {`${e.reporting.onTime}/${e.reporting.expected} on time`}
              </span>
              {team.onTimeRate != null && e.reporting.rate != null && (
                <Delta
                  value={e.reporting.rate - team.onTimeRate}
                  suffix=" vs team"
                />
              )}
            </div>
            <div className="mt-2.5">
              <StackedBar
                segments={[
                  { label: "On time", value: e.reporting.onTime, tone: "good" },
                  { label: "Late", value: e.reporting.late, tone: "warn" },
                  { label: "Missed", value: e.reporting.missed, tone: "bad" },
                ]}
              />
            </div>
            {e.reporting.avgLeadHours != null && (
              <p className="mt-2.5 text-[11px] text-muted-fg">
                {e.reporting.avgLeadHours >= 0
                  ? `Files ${e.reporting.avgLeadHours}h before the deadline on average.`
                  : `Files ${Math.abs(e.reporting.avgLeadHours)}h after the deadline on average.`}
              </p>
            )}
          </>
        )}
      </Block>

      {/* ---- meetings */}
      <Block title="Meetings">
        {meetingsSeen === 0 ? (
          <Empty>No meetings in this range.</Empty>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {e.meetings.rate != null ? `${e.meetings.rate}%` : "—"}
              </span>
              <span className="text-xs text-muted-fg">attended</span>
              {team.attendanceRate != null && e.meetings.rate != null && (
                <Delta
                  value={e.meetings.rate - team.attendanceRate}
                  suffix=" vs team"
                />
              )}
            </div>
            <div className="mt-2.5">
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
              <ul className="mt-3 flex flex-wrap gap-1">
                {e.meetings.recent.map((m, i) => {
                  const mark = ATTENDANCE_MARK[m.status];
                  return (
                    <li
                      key={`${m.label}-${i}`}
                      title={`${m.label} · ${mark.label}`}
                      className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${
                        MARK_BG[mark.tone]
                      }`}
                    >
                      {mark.ch}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Block>

      {/* ---- assigned work + daily focus */}
      <Block title="Assigned work">
        {e.tasks.total === 0 && e.dayTasks.total === 0 ? (
          <Empty>Nothing assigned or planned in this range.</Empty>
        ) : (
          <dl className="flex flex-col gap-1.5 text-[11px]">
            <Row
              label="Tasks done"
              value={
                e.tasks.total > 0
                  ? `${e.tasks.done}/${e.tasks.total}`
                  : "none assigned"
              }
            />
            <Row
              label="Overdue now"
              value={`${e.tasks.overdue}`}
              tone={e.tasks.overdue > 0 ? "bad" : undefined}
            />
            <Row
              label="Beat the deadline"
              value={e.tasks.done > 0 ? `${e.tasks.onTime}/${e.tasks.done}` : "—"}
            />
            <Row
              label="Daily focus ticked"
              value={
                e.dayTasks.total > 0
                  ? `${e.dayTasks.done}/${e.dayTasks.total} · ${e.dayTasks.days}d`
                  : "none set"
              }
            />
          </dl>
        )}
      </Block>

      {/* ---- money */}
      <Block title="Bonuses & fines">
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
                label="Outstanding"
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
        <Block title="Monthly goals">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums text-ink">
              {e.months.avgPercent != null ? `${e.months.avgPercent}%` : "—"}
            </span>
            <div className="min-w-0 flex-1">
              <Meter percent={e.months.avgPercent} />
              <p className="mt-1.5 text-[11px] text-muted-fg">
                {`${e.months.done}/${e.months.set} finished · ${e.months.tracked} month${
                  e.months.tracked === 1 ? "" : "s"
                }`}
              </p>
            </div>
          </div>
        </Block>
      )}
    </CardShell>,
    document.body,
  );
}
