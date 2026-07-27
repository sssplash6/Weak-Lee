// Pure helpers that turn each person's full history into the metrics shown on
// the admin Performance tab. No server-only imports — just math over rows the
// page already fetched (see the perf query in admin/page.tsx).
//
// Everything is computed for three ranges at once — previous week, current week,
// all time — so the tab's toggle is instant client-side state rather than three
// round trips. The window for a week range comes from the submission cycle, the
// same Sunday-12:00 anchor the rest of the admin views split on.

import { goalPercent, isGoalComplete, weekPercent } from "@/lib/progress";
import {
  currentSubmissionCycle,
  submissionDeadlineApplies,
  SUBMISSION_DEADLINE_EPOCH,
  weekSubmissionDeadline,
} from "@/lib/lateness";
import type { AttendanceStatus, PenaltyType } from "@/lib/penalties";

// ---------------------------------------------------------------- input shapes

type GoalLite = {
  title?: string;
  completedAt: Date | null;
  manualPercent: number | null;
  deadline?: Date | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | null;
  incompleteReason?: string | null;
  subtasks: { isDone: boolean }[];
  sharesOut?: { id: string }[];
  shareIn?: { id: string } | null;
};

/** The per-user rows the performance query loads (see admin/page.tsx). */
export type PerformanceSource = {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  avatar: string | null;
  createdAt: Date;
  weeks: {
    id: string;
    startDate: Date;
    endDate: Date;
    submittedLate: boolean;
    submittedAt: Date | null;
    goals: GoalLite[];
  }[];
  months: {
    startDate: Date;
    endDate: Date;
    submittedAt: Date | null;
    goals: GoalLite[];
  }[];
  attendances: { status: AttendanceStatus; meeting: { scheduledAt: Date } }[];
  penalties: {
    type: PenaltyType;
    amount: number;
    weekId: string | null;
    createdAt: Date;
    paidAt: Date | null;
  }[];
  bonuses: { amount: number; createdAt: Date }[];
  assignedTasks: {
    deadline: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }[];
  dayTasks: { date: Date; isDone: boolean }[];
};

// --------------------------------------------------------------- output shapes

export type RangeKey = "previous" | "current" | "all";

export type PriorityKey = "HIGH" | "MEDIUM" | "LOW" | "NONE";

/** One week in the completion trend chart. */
export type TrendPoint = {
  label: string; // "20 Jul"
  percent: number;
  goals: number;
  submitted: boolean;
  late: boolean;
};

export type EmployeePerformance = {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  avatar: string | null;
  /** Weeks since the account was created — a fairness note next to thin data. */
  tenureWeeks: number;
  joinedAt: Date;
  /** Composite 0–100 (see SCORE_WEIGHTS); null until there's history to score. */
  score: number | null;
  /** The three parts behind the score, each 0–100 or null when not applicable. */
  parts: { completion: number | null; attendance: number | null; onTime: number | null };
  rank: number | null; // overall, 1 = best; null when unscored
  deptRank: number | null; // within their department
  goals: {
    weeksTracked: number;
    avgPercent: number | null;
    /** True when avgPercent leans on a week that hasn't ended yet. */
    live: boolean;
    set: number;
    done: number;
    subtasksDone: number;
    subtasksTotal: number;
    byPriority: Record<PriorityKey, { set: number; done: number }>;
    withDeadline: number;
    metDeadline: number;
    missedDeadline: number;
    reflected: number; // sub-100% goals that carry a reflection reason
    needsReflection: number;
    best: TrendPoint | null;
    worst: TrendPoint | null;
  };
  months: { tracked: number; avgPercent: number | null; set: number; done: number };
  reporting: {
    /** On-time share of every cycle they owed a report for — misses included. */
    rate: number | null;
    expected: number; // cycles judged (governed, deadline passed, after joining)
    onTime: number;
    late: number;
    missed: number; // owed a report, never submitted one
    submitted: number; // weeks with goals submitted, for context
    /** Mean hours between submitting and the Sunday deadline (+ = early). */
    avgLeadHours: number | null;
  };
  meetings: {
    rate: number | null; // (attended + late) / (attended + late + skipped)
    attended: number;
    late: number;
    skipped: number;
    excused: number;
    /** Most recent meetings first — letter strip in the report card. */
    recent: { label: string; status: AttendanceStatus }[];
  };
  tasks: {
    total: number;
    done: number;
    open: number;
    overdue: number;
    onTime: number; // finished on or before the deadline
    rate: number | null;
  };
  dayTasks: { total: number; done: number; rate: number | null; days: number };
  delegation: { sharedOut: number; received: number };
  money: {
    bonusTotal: number;
    bonusCount: number;
    fineTotal: number;
    fineCount: number;
    outstanding: number;
    paid: number;
    net: number;
    byType: Record<PenaltyType, number>;
  };
  trend: TrendPoint[];
};

/**
 * A department's own numbers — the sum of its people, not a copy of one of
 * them. Rates are computed from the pooled counts (so a department of five
 * isn't the average of five averages where the underlying weeks differ), and
 * the people list rides along for the department card's ranking.
 */
export type DepartmentPerformance = {
  name: string;
  headcount: number;
  scored: number;
  avgScore: number | null;
  avgCompletion: number | null;
  attendanceRate: number | null;
  onTimeRate: number | null;
  goalsSet: number;
  goalsDone: number;
  subtasksDone: number;
  subtasksTotal: number;
  meetings: { attended: number; late: number; skipped: number; excused: number };
  reporting: { expected: number; onTime: number; late: number; missed: number };
  tasks: { total: number; done: number; overdue: number };
  dayTasks: { total: number; done: number };
  money: {
    bonusTotal: number;
    fineTotal: number;
    outstanding: number;
    net: number;
  };
  /** Department-average completion per week, oldest first. */
  trend: { label: string; percent: number }[];
  people: {
    id: string;
    name: string;
    avatar: string | null;
    email: string | null;
    score: number | null;
    completion: number | null;
  }[];
};

export type TeamPerformance = {
  headcount: number;
  scored: number;
  avgScore: number | null;
  avgCompletion: number | null;
  attendanceRate: number | null;
  onTimeRate: number | null;
  goalsSet: number;
  goalsDone: number;
  tasksDone: number;
  tasksTotal: number;
  bonusTotal: number;
  fineTotal: number;
  outstanding: number;
};

export type RangeReport = {
  key: RangeKey;
  label: string; // "Current week"
  window: string; // "20 – 26 Jul 2026" / "Everything to date"
  employees: EmployeePerformance[];
  team: TeamPerformance;
  departments: DepartmentPerformance[];
  /** Team-average completion per week, oldest first — the overview trend. */
  trend: { label: string; percent: number }[];
};

export type PerformanceReport = Record<RangeKey, RangeReport>;

// ------------------------------------------------------------------- internals

// How the composite score is mixed. Goal completion is the backbone: without
// completion history there is no score at all — otherwise one attended meeting
// would renormalize to a perfect 100 and outrank people with real, slightly
// imperfect records. The two smaller components are still skipped (and their
// weight folded back) when genuinely absent.
export const SCORE_WEIGHTS: { key: "completion" | "attendance" | "onTime"; label: string; weight: number }[] =
  [
    { key: "completion", label: "Goal completion", weight: 0.5 },
    { key: "attendance", label: "Meeting attendance", weight: 0.25 },
    { key: "onTime", label: "On-time reporting", weight: 0.25 },
  ];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function avg(values: number[]): number | null {
  return values.length
    ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
    : null;
}

function compositeScore(parts: EmployeePerformance["parts"]): number | null {
  if (parts.completion == null) return null;
  let sum = 0;
  let weight = 0;
  for (const { key, weight: w } of SCORE_WEIGHTS) {
    const value = parts[key];
    if (value == null) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

/** "20 Jul" — UTC-based, matching how period bounds are stored. */
function dayLabel(d: Date): string {
  return `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
}

function rangeWindowLabel(from: Date, to: Date): string {
  const end = new Date(to.getTime() - DAY_MS); // inclusive last day
  return `${dayLabel(from)} – ${dayLabel(end)} ${end.getUTCFullYear()}`;
}

type Window = { from: number; to: number };

const ALL: Window = { from: -Infinity, to: Infinity };

function inWindow(d: Date | null | undefined, w: Window): boolean {
  if (d == null) return false;
  const t = d.getTime();
  return t >= w.from && t < w.to;
}

/** The priority bucket a goal falls in (null priority is its own bucket). */
function priorityOf(g: GoalLite): PriorityKey {
  return g.priority ?? "NONE";
}

function emptyByPriority(): Record<PriorityKey, { set: number; done: number }> {
  return {
    HIGH: { set: 0, done: 0 },
    MEDIUM: { set: 0, done: 0 },
    LOW: { set: 0, done: 0 },
    NONE: { set: 0, done: 0 },
  };
}

function emptyByType(): Record<PenaltyType, number> {
  return { MEETING_SKIPPED: 0, MEETING_LATE: 0, LATE_SUBMISSION: 0, OTHER: 0 };
}

/**
 * Whether a goal beat its deadline. Deadlines are stored at UTC midnight and
 * read as whole days, so a goal completed any time on the due day counts.
 */
function metDeadline(g: GoalLite): boolean {
  if (!g.deadline || !g.completedAt) return false;
  return g.completedAt.getTime() < g.deadline.getTime() + DAY_MS;
}

function computeOne(
  u: PerformanceSource,
  win: Window,
  now: Date,
  trendWeeks: number,
  cycles: JudgedCycle[],
): EmployeePerformance {
  const nowMs = now.getTime();

  // ---- weekly goals
  // A week belongs to the range by its start date; "all" takes everything.
  const weeks = u.weeks
    .filter((w) => win === ALL || inWindow(w.startDate, win))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const withGoals = weeks.filter((w) => w.goals.length > 0);
  const closed = withGoals.filter((w) => w.endDate.getTime() < nowMs);
  // Averages prefer closed weeks so a half-done week can't drag the number
  // down; when the range only holds a live week we use it and flag it.
  const basis = closed.length > 0 ? closed : withGoals;
  const live = closed.length === 0 && withGoals.length > 0;
  const avgPercent = avg(basis.map((w) => weekPercent(w.goals)));

  const goals = withGoals.flatMap((w) => w.goals);
  const subtasks = goals.flatMap((g) => g.subtasks);
  const byPriority = emptyByPriority();
  for (const g of goals) {
    const slot = byPriority[priorityOf(g)];
    slot.set++;
    if (isGoalComplete(g)) slot.done++;
  }
  const withDeadline = goals.filter((g) => g.deadline != null);
  const partial = goals.filter((g) => goalPercent(g) < 100);

  // Lateness in the trend reads from the fine ledger too, so a forgiven week
  // stops being marked late here as well as in the reporting block.
  const lateFines = u.penalties.filter((p) => p.type === "LATE_SUBMISSION");
  const points: TrendPoint[] = withGoals.map((w) => ({
    label: dayLabel(w.startDate),
    percent: weekPercent(w.goals),
    goals: w.goals.length,
    submitted: w.submittedAt != null,
    late: hasLateFine(w, lateFines),
  }));
  const ranked = [...points].sort((a, b) => b.percent - a.percent);

  // ---- monthly goals
  const months = u.months
    .filter((m) => win === ALL || inWindow(m.startDate, win) || overlaps(m, win))
    .filter((m) => m.goals.length > 0);
  const closedMonths = months.filter((m) => m.endDate.getTime() < nowMs);
  const monthBasis = closedMonths.length > 0 ? closedMonths : months;
  const monthGoals = months.flatMap((m) => m.goals);

  // ---- reporting. Judged per *cycle owed*, not per report filed, so somebody
  // who never submitted counts as a miss instead of vanishing from the maths.
  // Within a cycle:
  //   • no week, or a week with nothing submitted → missed
  //   • carries a late-submission fine            → late
  //   • otherwise                                 → on time
  // The fine ledger IS the app's record of a missed deadline, so an admin
  // deleting one — forgiving it, or clearing a fine issued in error — clears
  // the person's late mark with it. Cycles before the deadline was enforced
  // aren't judged at all rather than being scored retroactively.
  const submitted = weeks.filter((w) => w.submittedAt != null);
  const owed = cycles.filter(
    (c) => u.createdAt.getTime() <= c.deadline.getTime(),
  );
  let onTimeCount = 0;
  let lateCount = 0;
  let missedCount = 0;
  for (const c of owed) {
    const row = u.weeks.find(
      (w) =>
        w.startDate.getTime() >= c.start.getTime() &&
        w.startDate.getTime() < c.start.getTime() + WEEK_MS,
    );
    if (!row || row.submittedAt == null) missedCount++;
    else if (hasLateFine(row, lateFines)) lateCount++;
    else onTimeCount++;
  }

  // How early they file, over the weeks the deadline actually governed — an
  // older week predating the rule has no meaningful lead time to average in.
  const leads = submitted
    .filter((w) => submissionDeadlineApplies(w.startDate))
    .map(
      (w) =>
        (weekSubmissionDeadline(w.startDate).getTime() -
          w.submittedAt!.getTime()) /
        3_600_000,
    );
  const avgLeadHours = leads.length
    ? Math.round(leads.reduce((s, v) => s + v, 0) / leads.length)
    : null;

  // ---- meetings
  const attendances = u.attendances
    .filter((a) => win === ALL || inWindow(a.meeting.scheduledAt, win))
    .sort(
      (a, b) => b.meeting.scheduledAt.getTime() - a.meeting.scheduledAt.getTime(),
    );
  const att = { attended: 0, late: 0, skipped: 0, excused: 0 };
  for (const a of attendances) {
    if (a.status === "ATTENDED") att.attended++;
    else if (a.status === "LATE") att.late++;
    else if (a.status === "SKIPPED") att.skipped++;
    else att.excused++;
  }

  // ---- assigned tasks: an open task belongs to the range by its deadline (or
  // when it was assigned); a finished one by when it was ticked off.
  const tasks = u.assignedTasks.filter((t) =>
    win === ALL
      ? true
      : t.completedAt != null
        ? inWindow(t.completedAt, win)
        : inWindow(t.deadline ?? t.createdAt, win),
  );
  const tasksDone = tasks.filter((t) => t.completedAt != null);
  const tasksOnTime = tasksDone.filter(
    (t) =>
      t.deadline == null ||
      t.completedAt!.getTime() < t.deadline.getTime() + DAY_MS,
  );
  const overdue = tasks.filter(
    (t) =>
      t.completedAt == null && t.deadline != null && t.deadline.getTime() < nowMs,
  );

  // ---- daily focus list
  const dayTasks = u.dayTasks.filter((t) => win === ALL || inWindow(t.date, win));
  const dayDone = dayTasks.filter((t) => t.isDone).length;
  const days = new Set(dayTasks.map((t) => t.date.getTime())).size;

  // ---- delegation (goal-level shares live on the goals of the range's weeks)
  const sharedOut = goals.reduce((s, g) => s + (g.sharesOut?.length ?? 0), 0);
  const received = goals.filter((g) => g.shareIn != null).length;

  // ---- money
  const bonuses = u.bonuses.filter((b) => win === ALL || inWindow(b.createdAt, win));
  const penalties = u.penalties.filter(
    (p) => win === ALL || inWindow(p.createdAt, win),
  );
  const byType = emptyByType();
  for (const p of penalties) byType[p.type] += p.amount;
  const bonusTotal = bonuses.reduce((s, b) => s + b.amount, 0);
  const fineTotal = penalties.reduce((s, p) => s + p.amount, 0);

  const parts = {
    completion: avgPercent,
    attendance: pct(att.attended + att.late, att.attended + att.late + att.skipped),
    onTime: pct(onTimeCount, owed.length),
  };

  return {
    id: u.id,
    name: u.name ?? u.email ?? "—",
    email: u.email,
    department: u.department,
    avatar: u.avatar,
    tenureWeeks: Math.max(
      0,
      Math.floor((nowMs - u.createdAt.getTime()) / WEEK_MS),
    ),
    joinedAt: u.createdAt,
    score: compositeScore(parts),
    parts,
    rank: null, // filled in by buildRange once everyone is scored
    deptRank: null,
    goals: {
      weeksTracked: basis.length,
      avgPercent,
      live,
      set: goals.length,
      done: goals.filter(isGoalComplete).length,
      subtasksDone: subtasks.filter((s) => s.isDone).length,
      subtasksTotal: subtasks.length,
      byPriority,
      withDeadline: withDeadline.length,
      metDeadline: withDeadline.filter(metDeadline).length,
      missedDeadline: withDeadline.filter((g) => !metDeadline(g)).length,
      reflected: partial.filter((g) => (g.incompleteReason ?? "").trim() !== "")
        .length,
      needsReflection: partial.length,
      best: ranked[0] ?? null,
      worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    },
    months: {
      tracked: monthBasis.length,
      avgPercent: avg(monthBasis.map((m) => weekPercent(m.goals))),
      set: monthGoals.length,
      done: monthGoals.filter(isGoalComplete).length,
    },
    reporting: {
      rate: parts.onTime,
      expected: owed.length,
      onTime: onTimeCount,
      late: lateCount,
      missed: missedCount,
      submitted: submitted.length,
      avgLeadHours,
    },
    meetings: {
      rate: parts.attendance,
      ...att,
      recent: attendances.slice(0, 8).map((a) => ({
        label: dayLabel(a.meeting.scheduledAt),
        status: a.status,
      })),
    },
    tasks: {
      total: tasks.length,
      done: tasksDone.length,
      open: tasks.length - tasksDone.length,
      overdue: overdue.length,
      onTime: tasksOnTime.length,
      rate: pct(tasksDone.length, tasks.length),
    },
    dayTasks: {
      total: dayTasks.length,
      done: dayDone,
      rate: pct(dayDone, dayTasks.length),
      days,
    },
    delegation: { sharedOut, received },
    money: {
      bonusTotal,
      bonusCount: bonuses.length,
      fineTotal,
      fineCount: penalties.length,
      outstanding: penalties
        .filter((p) => p.paidAt == null)
        .reduce((s, p) => s + p.amount, 0),
      paid: penalties
        .filter((p) => p.paidAt != null)
        .reduce((s, p) => s + p.amount, 0),
      net: bonusTotal - fineTotal,
      byType,
    },
    trend: points.slice(-trendWeeks),
  };
}

export type JudgedCycle = { start: Date; deadline: Date };

/**
 * The weekly cycles a range holds people to: every governed cycle whose Sunday
 * deadline has already passed. This is the reporting denominator — counting
 * cycles rather than filed reports is what makes a week nobody submitted show
 * up as a miss instead of quietly leaving the average alone.
 */
function judgedCycles(win: Window, now: Date): JudgedCycle[] {
  // The first governed cycle is the week whose deadline IS the epoch (the epoch
  // is that Sunday 12:00 Tashkent, so its Monday is the next day).
  const first = new Date(SUBMISSION_DEADLINE_EPOCH);
  first.setUTCHours(0, 0, 0, 0);
  first.setUTCDate(first.getUTCDate() + 1);

  const out: JudgedCycle[] = [];
  for (let t = first.getTime(); ; t += WEEK_MS) {
    const start = new Date(t);
    const deadline = weekSubmissionDeadline(start);
    if (deadline.getTime() > now.getTime()) break; // not owed yet
    if (t >= win.from && t < win.to) out.push({ start, deadline });
    if (out.length > 520) break; // ten years of cycles — a runaway guard
  }
  return out;
}

/**
 * Whether a late-submission fine belongs to this week. The sweep links a fine
 * to the week it was issued for, but a fine raised when the person had no week
 * row yet carries no link — those are matched by cycle instead, i.e. the fine
 * landed between this week's deadline and the next one's.
 */
function hasLateFine(
  week: { id: string; startDate: Date },
  fines: { weekId: string | null; createdAt: Date }[],
): boolean {
  const from = weekSubmissionDeadline(week.startDate).getTime();
  const to = from + WEEK_MS;
  return fines.some((f) =>
    f.weekId != null
      ? f.weekId === week.id
      : f.createdAt.getTime() >= from && f.createdAt.getTime() < to,
  );
}

/** Whether a month overlaps the window at all (months are longer than a week). */
function overlaps(m: { startDate: Date; endDate: Date }, w: Window): boolean {
  return m.startDate.getTime() < w.to && m.endDate.getTime() >= w.from;
}

function buildRange(
  users: PerformanceSource[],
  win: Window,
  now: Date,
  meta: { key: RangeKey; label: string; window: string; trendWeeks: number },
): RangeReport {
  const cycles = judgedCycles(win, now);
  const employees = users
    .map((u) => computeOne(u, win, now, meta.trendWeeks, cycles))
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name),
    );

  // Ranks: overall and within the department. Unscored people keep null so the
  // UI can say "not scored yet" instead of implying a last place.
  let seen = 0;
  const perDept = new Map<string, number>();
  for (const e of employees) {
    if (e.score == null) continue;
    e.rank = ++seen;
    const dept = e.department ?? "—";
    const next = (perDept.get(dept) ?? 0) + 1;
    perDept.set(dept, next);
    e.deptRank = next;
  }

  const scored = employees.filter((e) => e.score != null);
  const completions = employees
    .map((e) => e.goals.avgPercent)
    .filter((v): v is number => v != null);
  const attended = employees.reduce(
    (s, e) => s + e.meetings.attended + e.meetings.late,
    0,
  );
  const attendanceDenom = employees.reduce(
    (s, e) => s + e.meetings.attended + e.meetings.late + e.meetings.skipped,
    0,
  );
  // Pooled from cycles owed, not reports filed, so misses count here too.
  const onTime = employees.reduce((s, e) => s + e.reporting.onTime, 0);
  const owedTotal = employees.reduce((s, e) => s + e.reporting.expected, 0);

  // Week labels in chronological order, so any merged trend can be sorted
  // without carrying dates through the view types.
  const labelAt = new Map<string, number>();
  for (const u of users) {
    for (const w of u.weeks) {
      const label = dayLabel(w.startDate);
      const at = w.startDate.getTime();
      if (!labelAt.has(label) || at < labelAt.get(label)!) labelAt.set(label, at);
    }
  }
  /** Average completion per week across a group of people, oldest week first. */
  function mergeTrends(list: EmployeePerformance[]) {
    const byLabel = new Map<string, { sum: number; n: number }>();
    for (const e of list) {
      for (const p of e.trend) {
        const slot = byLabel.get(p.label) ?? { sum: 0, n: 0 };
        slot.sum += p.percent;
        slot.n++;
        byLabel.set(p.label, slot);
      }
    }
    return [...byLabel.entries()]
      .map(([label, { sum, n }]) => ({
        label,
        percent: Math.round(sum / n),
        at: labelAt.get(label) ?? 0,
      }))
      .sort((a, b) => a.at - b.at)
      .map(({ label, percent }) => ({ label, percent }));
  }

  // Department rollups, biggest first. People with no department are grouped
  // under "Unassigned" so nobody silently drops out of the comparison.
  const groups = new Map<string, EmployeePerformance[]>();
  for (const e of employees) {
    const key = e.department?.trim() || "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const sum = (list: EmployeePerformance[], f: (e: EmployeePerformance) => number) =>
    list.reduce((s, e) => s + f(e), 0);

  const departments: DepartmentPerformance[] = [...groups.entries()]
    .map(([name, list]) => ({
      name,
      headcount: list.length,
      scored: list.filter((e) => e.score != null).length,
      avgScore: avg(
        list.map((e) => e.score).filter((v): v is number => v != null),
      ),
      avgCompletion: avg(
        list.map((e) => e.goals.avgPercent).filter((v): v is number => v != null),
      ),
      attendanceRate: pct(
        sum(list, (e) => e.meetings.attended + e.meetings.late),
        sum(
          list,
          (e) => e.meetings.attended + e.meetings.late + e.meetings.skipped,
        ),
      ),
      onTimeRate: pct(
        sum(list, (e) => e.reporting.onTime),
        sum(list, (e) => e.reporting.expected),
      ),
      goalsSet: sum(list, (e) => e.goals.set),
      goalsDone: sum(list, (e) => e.goals.done),
      subtasksDone: sum(list, (e) => e.goals.subtasksDone),
      subtasksTotal: sum(list, (e) => e.goals.subtasksTotal),
      meetings: {
        attended: sum(list, (e) => e.meetings.attended),
        late: sum(list, (e) => e.meetings.late),
        skipped: sum(list, (e) => e.meetings.skipped),
        excused: sum(list, (e) => e.meetings.excused),
      },
      reporting: {
        expected: sum(list, (e) => e.reporting.expected),
        onTime: sum(list, (e) => e.reporting.onTime),
        late: sum(list, (e) => e.reporting.late),
        missed: sum(list, (e) => e.reporting.missed),
      },
      tasks: {
        total: sum(list, (e) => e.tasks.total),
        done: sum(list, (e) => e.tasks.done),
        overdue: sum(list, (e) => e.tasks.overdue),
      },
      dayTasks: {
        total: sum(list, (e) => e.dayTasks.total),
        done: sum(list, (e) => e.dayTasks.done),
      },
      money: {
        bonusTotal: sum(list, (e) => e.money.bonusTotal),
        fineTotal: sum(list, (e) => e.money.fineTotal),
        outstanding: sum(list, (e) => e.money.outstanding),
        net: sum(list, (e) => e.money.net),
      },
      // The department's week-by-week average: each week label averaged across
      // whoever had goals that week.
      trend: mergeTrends(list),
      people: list.map((e) => ({
        id: e.id,
        name: e.name,
        avatar: e.avatar,
        email: e.email,
        score: e.score,
        completion: e.goals.avgPercent,
      })),
    }))
    .sort(
      (a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.headcount - a.headcount,
    );

  const trend = mergeTrends(employees);

  return {
    ...meta,
    employees,
    team: {
      headcount: employees.length,
      scored: scored.length,
      avgScore: avg(scored.map((e) => e.score as number)),
      avgCompletion: avg(completions),
      attendanceRate: pct(attended, attendanceDenom),
      onTimeRate: pct(onTime, owedTotal),
      goalsSet: employees.reduce((s, e) => s + e.goals.set, 0),
      goalsDone: employees.reduce((s, e) => s + e.goals.done, 0),
      tasksDone: employees.reduce((s, e) => s + e.tasks.done, 0),
      tasksTotal: employees.reduce((s, e) => s + e.tasks.total, 0),
      bonusTotal: employees.reduce((s, e) => s + e.money.bonusTotal, 0),
      fineTotal: employees.reduce((s, e) => s + e.money.fineTotal, 0),
      outstanding: employees.reduce((s, e) => s + e.money.outstanding, 0),
    },
    departments,
    trend,
  };
}

/**
 * Every employee's performance for all three ranges, each ranked best-first
 * (people with no history sink to the bottom), plus department and team
 * rollups. The week windows come from the current submission cycle, so
 * "current week" means the week people owe goals for right now.
 */
export function buildPerformance(
  users: PerformanceSource[],
  now = new Date(),
): PerformanceReport {
  const cycle = currentSubmissionCycle(now);
  const curFrom = cycle.weekStart.getTime();
  const current: Window = { from: curFrom, to: curFrom + WEEK_MS };
  const previous: Window = { from: curFrom - WEEK_MS, to: curFrom };

  return {
    previous: buildRange(users, previous, now, {
      key: "previous",
      label: "Previous week",
      window: rangeWindowLabel(new Date(previous.from), new Date(previous.to)),
      trendWeeks: 1,
    }),
    current: buildRange(users, current, now, {
      key: "current",
      label: "Current week",
      window: rangeWindowLabel(new Date(current.from), new Date(current.to)),
      trendWeeks: 1,
    }),
    all: buildRange(users, ALL, now, {
      key: "all",
      label: "All time",
      window: "Everything to date",
      trendWeeks: 12,
    }),
  };
}

/** Score band — coarse on purpose; the number carries the detail. */
export function scoreBand(score: number): {
  label: string;
  tone: "good" | "warn" | "bad";
} {
  if (score >= 80) return { label: "Strong", tone: "good" };
  if (score >= 55) return { label: "Steady", tone: "warn" };
  return { label: "Behind", tone: "bad" };
}
