"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { resolveAvatar } from "@/lib/avatar";
import { formatMoney } from "@/lib/penalties";
import {
  scoreBand,
  type DepartmentPerformance,
  type RangeReport,
} from "@/lib/performance";
import {
  DivergingPair,
  Meter,
  ScoreDial,
  StackedBar,
  TrendColumns,
} from "./charts";
import { Block, CardShell, Delta, Empty, Row, TONE_TEXT } from "./reportBits";

/**
 * A department's card: its people pooled into one set of numbers, then the
 * ranking inside it. Rates come from the pooled counts, not an average of
 * per-person averages, so a five-person department reads correctly however
 * uneven its members' histories are. Clicking a person hands off to their card.
 */
export function DepartmentReport({
  department: d,
  report,
  onClose,
  onOpenPerson,
}: {
  department: DepartmentPerformance;
  report: RangeReport;
  onClose: () => void;
  onOpenPerson: (id: string) => void;
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

  const team = report.team;
  const band = d.avgScore != null ? scoreBand(d.avgScore) : null;
  const meetingsSeen =
    d.meetings.attended + d.meetings.late + d.meetings.skipped + d.meetings.excused;
  const ranked = [...d.people].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return createPortal(
    <CardShell
      label={`${d.name} — department performance`}
      onClose={onClose}
      header={
        <>
          {/* Stands in for the person card's avatar so both headers line up. */}
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-bold text-brand"
            aria-hidden="true"
          >
            {d.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-ink">{d.name}</h2>
              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                {`${d.headcount} ${d.headcount === 1 ? "person" : "people"}`}
              </span>
            </div>
            <p className="mt-1.5 truncate text-xs text-muted-fg">
              {`${report.window} · ${d.scored} scored of ${d.headcount}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <ScoreDial score={d.avgScore} tone={band ? band.tone : "mute"} />
            {d.avgScore != null && team.avgScore != null && (
              <Delta value={d.avgScore - team.avgScore} suffix=" vs team" />
            )}
          </div>
        </>
      }
    >
      {/* ---- headline rates against the team */}
      <Block title="Against the team">
        <ul className="flex flex-col gap-3">
          {[
            { label: "Completion", value: d.avgCompletion, team: team.avgCompletion },
            { label: "Meetings", value: d.attendanceRate, team: team.attendanceRate },
            { label: "On time", value: d.onTimeRate, team: team.onTimeRate },
          ].map((m) => (
            <li key={m.label}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-ink">{m.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold tabular-nums text-ink">
                    {m.value != null ? `${m.value}%` : "—"}
                  </span>
                  {m.value != null && m.team != null && (
                    <Delta value={m.value - m.team} suffix="" />
                  )}
                </span>
              </div>
              <div className="mt-1.5">
                <Meter percent={m.value} label={`${m.label} ${m.value ?? "no data"}`} />
              </div>
            </li>
          ))}
        </ul>
      </Block>

      {/* ---- completion over time */}
      <Block title="Completion by week">
        {d.trend.length > 1 ? (
          <TrendColumns points={d.trend.slice(-12)} />
        ) : d.trend.length === 1 ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums text-ink">
              {d.trend[0].percent}%
            </span>
            <div className="min-w-0 flex-1">
              <Meter percent={d.trend[0].percent} />
            </div>
          </div>
        ) : (
          <Empty>No weeks with goals in this range.</Empty>
        )}
      </Block>

      {/* ---- work delivered */}
      <Block title="Work">
        <dl className="flex flex-col gap-1.5 text-[11px]">
          <Row label="Goals finished" value={`${d.goalsDone}/${d.goalsSet}`} />
          <Row
            label="Subtasks ticked"
            value={`${d.subtasksDone}/${d.subtasksTotal}`}
          />
          <Row
            label="Assigned tasks done"
            value={d.tasks.total > 0 ? `${d.tasks.done}/${d.tasks.total}` : "none"}
          />
          <Row
            label="Overdue now"
            value={`${d.tasks.overdue}`}
            tone={d.tasks.overdue > 0 ? "bad" : undefined}
          />
          <Row
            label="Daily focus ticked"
            value={
              d.dayTasks.total > 0
                ? `${d.dayTasks.done}/${d.dayTasks.total}`
                : "none set"
            }
          />
        </dl>
      </Block>

      {/* ---- reporting + meetings, pooled */}
      <Block title="Reliability">
        {d.reporting.expected === 0 && meetingsSeen === 0 ? (
          <Empty>Nothing due in this range.</Empty>
        ) : (
          <>
            {d.reporting.expected > 0 && (
              <>
                <p className="text-[11px] text-muted-fg">Reports</p>
                <div className="mt-1.5">
                  <StackedBar
                    segments={[
                      { label: "On time", value: d.reporting.onTime, tone: "good" },
                      { label: "Late", value: d.reporting.late, tone: "warn" },
                      { label: "Missed", value: d.reporting.missed, tone: "bad" },
                    ]}
                  />
                </div>
              </>
            )}
            {meetingsSeen > 0 && (
              <>
                <p className="mt-3 text-[11px] text-muted-fg">Meetings</p>
                <div className="mt-1.5">
                  <StackedBar
                    segments={[
                      { label: "Attended", value: d.meetings.attended, tone: "good" },
                      { label: "Late", value: d.meetings.late, tone: "warn" },
                      { label: "Skipped", value: d.meetings.skipped, tone: "bad" },
                      { label: "Excused", value: d.meetings.excused, tone: "mute" },
                    ]}
                  />
                </div>
              </>
            )}
          </>
        )}
      </Block>

      {/* ---- who's who: ranked, and each row opens that person's card */}
      <Block title="People">
        <ul className="flex flex-col gap-1">
          {ranked.map((p) => {
            const avatar = resolveAvatar(p.avatar, p.email ?? p.id);
            const tone = p.score != null ? scoreBand(p.score).tone : null;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenPerson(p.id)}
                  aria-label={`Open ${p.name}'s performance card`}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-surface"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${avatar.bg}`}
                    aria-hidden="true"
                  >
                    {avatar.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {p.name}
                  </span>
                  <span className="w-20 shrink-0">
                    <Meter
                      percent={p.completion}
                      label={`Completion ${p.completion ?? "no data"}`}
                    />
                  </span>
                  <span
                    className={`w-8 shrink-0 text-right text-xs font-bold tabular-nums ${
                      tone ? TONE_TEXT[tone] : "text-muted-fg"
                    }`}
                  >
                    {p.score ?? "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Block>

      {/* ---- money */}
      <Block title="Bonuses & fines">
        {d.money.bonusTotal === 0 && d.money.fineTotal === 0 ? (
          <Empty>Clean slate in this range.</Empty>
        ) : (
          <>
            <DivergingPair
              positive={d.money.bonusTotal}
              negative={d.money.fineTotal}
              positiveLabel="Bonuses"
              negativeLabel="Fines"
              format={formatMoney}
            />
            <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[11px]">
              <Row
                label="Net"
                value={`${d.money.net >= 0 ? "+" : "−"}${formatMoney(Math.abs(d.money.net))}`}
                tone={d.money.net >= 0 ? "good" : "bad"}
              />
              <Row
                label="Outstanding"
                value={formatMoney(d.money.outstanding)}
                tone={d.money.outstanding > 0 ? "bad" : undefined}
              />
            </dl>
          </>
        )}
      </Block>
    </CardShell>,
    document.body,
  );
}
