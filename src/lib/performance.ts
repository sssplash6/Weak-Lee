// Pure helpers that turn each user's full history into the per-employee
// metrics shown on the admin Performance tab. No server-only imports — just
// math over rows the page already fetched.
//
// Averages deliberately cover *closed* weeks/months only: a half-done current
// week would drag everyone's numbers down mid-period and make the tab read
// differently on Tuesday than on Sunday.

import { isGoalComplete, weekPercent } from "@/lib/progress";
import type { AttendanceStatus } from "@/lib/penalties";

type GoalLite = {
  completedAt: Date | null;
  manualPercent: number | null;
  subtasks: { isDone: boolean }[];
};

/** The per-user rows the performance query loads (see admin/page.tsx). */
export type PerformanceSource = {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  avatar: string | null;
  weeks: {
    startDate: Date;
    endDate: Date;
    submittedLate: boolean;
    submittedAt: Date | null;
    goals: GoalLite[];
  }[];
  months: { startDate: Date; endDate: Date; goals: GoalLite[] }[];
  attendances: { status: AttendanceStatus }[];
  penalties: { amount: number }[];
  bonuses: { amount: number }[];
  assignedTasks: { completedAt: Date | null }[];
};

export type EmployeePerformance = {
  id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  avatar: string | null;
  /** Composite 0–100 (see SCORE_WEIGHTS); null until there's any history. */
  score: number | null;
  weekly: {
    /** Closed weeks that had at least one goal. */
    tracked: number;
    avgPercent: number | null;
    goalsSet: number;
    goalsDone: number;
  };
  monthly: {
    tracked: number;
    avgPercent: number | null;
    goalsSet: number;
    goalsDone: number;
  };
  meetings: {
    rate: number | null; // (attended + late) / (attended + late + skipped)
    attended: number;
    late: number;
    skipped: number;
    excused: number;
  };
  reporting: {
    rate: number | null; // on-time share of submitted weeks
    onTime: number;
    submitted: number;
  };
  tasks: { done: number; total: number };
  money: {
    bonusTotal: number;
    bonusCount: number;
    fineTotal: number;
    fineCount: number;
    net: number;
  };
};

export type TeamPerformance = {
  avgScore: number | null;
  avgCompletion: number | null;
  attendanceRate: number | null;
  onTimeRate: number | null;
  bonusTotal: number;
  fineTotal: number;
};

// How the composite score is mixed. Components a person has no data for yet
// are skipped and the remaining weights renormalized, so a brand-new user
// isn't scored 0 for history they couldn't have.
const SCORE_WEIGHTS: [keyof ScoreParts, number][] = [
  ["completion", 0.5],
  ["attendance", 0.25],
  ["onTime", 0.25],
];

type ScoreParts = {
  completion: number | null;
  attendance: number | null;
  onTime: number | null;
};

function compositeScore(parts: ScoreParts): number | null {
  let sum = 0;
  let weight = 0;
  for (const [key, w] of SCORE_WEIGHTS) {
    const value = parts[key];
    if (value == null) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function computeOne(u: PerformanceSource, now: Date): EmployeePerformance {
  // Weekly history: only weeks that have fully ended count toward averages.
  const closedWeeks = u.weeks.filter((w) => w.endDate.getTime() < now.getTime());
  const trackedWeeks = closedWeeks.filter((w) => w.goals.length > 0);
  const weekGoals = trackedWeeks.flatMap((w) => w.goals);
  const avgWeekPercent = trackedWeeks.length
    ? Math.round(
        trackedWeeks.reduce((s, w) => s + weekPercent(w.goals), 0) /
          trackedWeeks.length,
      )
    : null;

  const closedMonths = u.months.filter(
    (m) => m.endDate.getTime() < now.getTime(),
  );
  const trackedMonths = closedMonths.filter((m) => m.goals.length > 0);
  const monthGoals = trackedMonths.flatMap((m) => m.goals);
  const avgMonthPercent = trackedMonths.length
    ? Math.round(
        trackedMonths.reduce((s, m) => s + weekPercent(m.goals), 0) /
          trackedMonths.length,
      )
    : null;

  // On-time reporting: lateness is known the moment a week is submitted, so
  // every submitted week counts (including the current one).
  const submitted = u.weeks.filter((w) => w.submittedAt != null);
  const onTime = submitted.filter((w) => !w.submittedLate).length;

  // Meetings: EXCUSED absences don't count against (or for) the rate; LATE
  // still counts as present, matching how fines treat it.
  const att = { attended: 0, late: 0, skipped: 0, excused: 0 };
  for (const a of u.attendances) {
    if (a.status === "ATTENDED") att.attended++;
    else if (a.status === "LATE") att.late++;
    else if (a.status === "SKIPPED") att.skipped++;
    else att.excused++;
  }
  const meetingsRate = pct(
    att.attended + att.late,
    att.attended + att.late + att.skipped,
  );

  const tasksDone = u.assignedTasks.filter((t) => t.completedAt != null).length;

  const bonusTotal = u.bonuses.reduce((s, b) => s + b.amount, 0);
  const fineTotal = u.penalties.reduce((s, p) => s + p.amount, 0);

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    department: u.department,
    avatar: u.avatar,
    score: compositeScore({
      completion: avgWeekPercent,
      attendance: meetingsRate,
      onTime: pct(onTime, submitted.length),
    }),
    weekly: {
      tracked: trackedWeeks.length,
      avgPercent: avgWeekPercent,
      goalsSet: weekGoals.length,
      goalsDone: weekGoals.filter(isGoalComplete).length,
    },
    monthly: {
      tracked: trackedMonths.length,
      avgPercent: avgMonthPercent,
      goalsSet: monthGoals.length,
      goalsDone: monthGoals.filter(isGoalComplete).length,
    },
    meetings: { rate: meetingsRate, ...att },
    reporting: {
      rate: pct(onTime, submitted.length),
      onTime,
      submitted: submitted.length,
    },
    tasks: { done: tasksDone, total: u.assignedTasks.length },
    money: {
      bonusTotal,
      bonusCount: u.bonuses.length,
      fineTotal,
      fineCount: u.penalties.length,
      net: bonusTotal - fineTotal,
    },
  };
}

/**
 * All employees' performance, ranked best-first (people with no history yet
 * sink to the bottom), plus team-wide aggregates for the stat strip.
 */
export function buildPerformance(
  users: PerformanceSource[],
  now: Date,
): { employees: EmployeePerformance[]; team: TeamPerformance } {
  const employees = users
    .map((u) => computeOne(u, now))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const scored = employees.filter((e) => e.score != null);
  const withAvg = employees.filter((e) => e.weekly.avgPercent != null);
  const attended = employees.reduce(
    (s, e) => s + e.meetings.attended + e.meetings.late,
    0,
  );
  const attendanceDenom = employees.reduce(
    (s, e) => s + e.meetings.attended + e.meetings.late + e.meetings.skipped,
    0,
  );
  const onTime = employees.reduce((s, e) => s + e.reporting.onTime, 0);
  const submitted = employees.reduce((s, e) => s + e.reporting.submitted, 0);

  return {
    employees,
    team: {
      avgScore: scored.length
        ? Math.round(scored.reduce((s, e) => s + (e.score ?? 0), 0) / scored.length)
        : null,
      avgCompletion: withAvg.length
        ? Math.round(
            withAvg.reduce((s, e) => s + (e.weekly.avgPercent ?? 0), 0) /
              withAvg.length,
          )
        : null,
      attendanceRate: pct(attended, attendanceDenom),
      onTimeRate: pct(onTime, submitted),
      bonusTotal: employees.reduce((s, e) => s + e.money.bonusTotal, 0),
      fineTotal: employees.reduce((s, e) => s + e.money.fineTotal, 0),
    },
  };
}
