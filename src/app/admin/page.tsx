import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Admin" };
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { goalPercent, isGoalComplete, weekPercent } from "@/lib/progress";
import { getWeekBounds } from "@/lib/weeks";
import { currentMeetingSlot } from "@/lib/meetings";
import { currentSubmissionCycle } from "@/lib/lateness";
import { reconcileSubmissionFines } from "@/lib/submissionFines";
import {
  formatDateTimeTz,
  formatStamp,
  formatYmd,
  toStamp,
  toYmd,
} from "@/lib/dates";
import { formatMoney, PENALTY_LABEL } from "@/lib/penalties";
import { resolveAvatar } from "@/lib/avatar";
import { monthLabel } from "@/lib/months";
import { AdminTabs, type AdminTab } from "./_components/AdminTabs";
import { AssignedTasksPanel } from "./_components/AssignedTasksPanel";
import { CollapsibleSection } from "./_components/CollapsibleSection";
import { AdminUserList, type AdminUser } from "./_components/AdminUserList";
import { PerformancePanel } from "./_components/PerformancePanel";
import { buildPerformance } from "@/lib/performance";
import { RecentBonuses } from "./_components/RecentBonuses";
import { RecentPenalties } from "./_components/RecentPenalties";
import { AttendancePanel } from "./_components/AttendancePanel";
import { AttendanceHistory } from "./_components/AttendanceHistory";

// Render week ranges by their UTC calendar date (matching how week bounds are
// stored) so the dates don't drift by the viewer's timezone.
function fmtRange(start: Date, end: Date): string {
  return `${formatYmd(toYmd(start))} – ${formatYmd(toYmd(end))}`;
}

// The goal fields every period list needs — enough for goalPercent/weekPercent
// and the expandable goal rows. Shared by the week and month selects.
const goalSelect = {
  orderBy: { position: "asc" },
  select: {
    id: true,
    title: true,
    completedAt: true,
    deadline: true,
    manualPercent: true,
    incompleteReason: true,
    subtasks: {
      orderBy: { position: "asc" },
      select: { title: true, isDone: true },
    },
  },
} as const;

type PeriodGoal = {
  id: string;
  title: string;
  completedAt: Date | null;
  deadline: Date | null;
  manualPercent: number | null;
  incompleteReason: string | null;
  subtasks: { title: string; isDone: boolean }[];
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const session = await auth();
  // Gate: must be signed in AND an admin. Everyone else goes to the dashboard.
  if (!session?.user?.id) redirect("/signin");
  if (!isAdmin(session.user.email)) redirect("/dashboard");

  // Sweep the team's weekly submission fines up to date before rendering, so the
  // admin view (and everyone's fines) reflect the deadline the moment it's
  // opened. Idempotent and best-effort.
  await reconcileSubmissionFines().catch(() => {});

  const tabParam = (await searchParams).tab;
  const tab: AdminTab =
    tabParam === "previous"
      ? "previous"
      : tabParam === "month"
        ? "month"
        : tabParam === "perf"
          ? "perf"
          : "current";

  const now = new Date();
  const cycle = currentSubmissionCycle(now);

  const [
    rawUsers,
    feedback,
    lateWeeks,
    recentPenalties,
    recentBonuses,
    currentMeeting,
    recentMeetings,
    assignedTasks,
    allPenalties,
    perfUsers,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        avatar: true,
        // The most recent weeks, newest first — enough to pick out the current
        // and previous cycle weeks even when someone has reported ahead.
        weeks: {
          orderBy: { startDate: "desc" },
          take: 4,
          select: {
            startDate: true,
            endDate: true,
            submittedLate: true,
            submittedAt: true,
            goals: goalSelect,
          },
        },
        // Months are created lazily, so a user may have no current month — they
        // render as "no goals" on the This month tab.
        months: {
          where: { isCurrent: true },
          select: {
            startDate: true,
            submittedAt: true,
            goals: goalSelect,
          },
        },
        // Only outstanding (unpaid) fines — the per-user total and list here
        // mean "what they still owe". Settled fines live in the /penalties
        // archive.
        penalties: {
          where: { paidAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            amount: true,
            note: true,
            createdAt: true,
          },
        },
        bonuses: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            amount: true,
            note: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, message: true, userEmail: true, createdAt: true },
    }),
    prisma.week.findMany({
      where: { submittedLate: true },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.penalty.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        amount: true,
        note: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.bonus.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        amount: true,
        note: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.meeting.findUnique({
      where: { scheduledAt: currentMeetingSlot() },
      select: {
        id: true,
        attendances: { select: { userId: true, status: true } },
        penalties: {
          where: { type: { in: ["MEETING_SKIPPED", "MEETING_LATE"] } },
          select: { userId: true, amount: true },
        },
      },
    }),
    // The last several Monday meetings, newest first, for the attendance-history
    // strip.
    prisma.meeting.findMany({
      orderBy: { scheduledAt: "desc" },
      take: 8,
      select: {
        scheduledAt: true,
        attendances: { select: { userId: true, status: true } },
      },
    }),
    // Admin-assigned tasks (all people), pending first, for the tracking list.
    prisma.assignedTask.findMany({
      orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        userId: true,
        title: true,
        note: true,
        scope: true,
        deadline: true,
        completedAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    // Every outstanding penalty, uncapped. Feeds the "Outstanding" stat, which
    // must not miss entries the capped recent-penalties list drops.
    prisma.penalty.findMany({
      where: { paidAt: null },
      select: { amount: true },
    }),
    // Full per-user history for the Performance tab — every week and month
    // with goals, plus attendance/fines/bonuses/tasks. Heavy, so only loaded
    // when that tab is actually open.
    tab === "perf"
      ? prisma.user.findMany({
          orderBy: [{ name: "asc" }, { email: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
            avatar: true,
            weeks: {
              select: {
                startDate: true,
                endDate: true,
                submittedLate: true,
                submittedAt: true,
                goals: {
                  select: {
                    completedAt: true,
                    manualPercent: true,
                    subtasks: { select: { isDone: true } },
                  },
                },
              },
            },
            months: {
              select: {
                startDate: true,
                endDate: true,
                goals: {
                  select: {
                    completedAt: true,
                    manualPercent: true,
                    subtasks: { select: { isDone: true } },
                  },
                },
              },
            },
            attendances: { select: { status: true } },
            penalties: { select: { amount: true } },
            bonuses: { select: { amount: true } },
            assignedTasks: { select: { completedAt: true } },
          },
        })
      : null,
  ]);

  const perf = perfUsers ? buildPerformance(perfUsers, now) : null;

  const { start: weekStart, end: weekEnd } = getWeekBounds(now);

  // Each person's admin-assigned tasks, keyed by user — shown inside their
  // expanded row (period-agnostic, same on every tab).
  const tasksByUser = new Map<string, typeof assignedTasks>();
  for (const t of assignedTasks) {
    const list = tasksByUser.get(t.userId) ?? [];
    list.push(t);
    tasksByUser.set(t.userId, list);
  }

  // Build the shared, period-agnostic AdminUser shell. The caller supplies the
  // period-specific bits (label, goals, submission/lateness) so the same row UI
  // renders for the week, next-week, and month tabs.
  function baseUser(
    u: (typeof rawUsers)[number],
    fields: {
      label: string | null;
      late: boolean;
      submittedAt: Date | null;
      misdated: boolean;
      notClosed?: boolean;
      goals: PeriodGoal[];
    },
  ): AdminUser {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department,
      avatar: u.avatar,
      weekLabel: fields.label,
      misdated: fields.misdated,
      notClosed: fields.notClosed ?? false,
      late: fields.late,
      submittedAtLabel: fields.submittedAt
        ? formatDateTimeTz(fields.submittedAt)
        : null,
      percent: weekPercent(fields.goals),
      goalCount: fields.goals.length,
      completedCount: fields.goals.filter(isGoalComplete).length,
      penaltyTotal: u.penalties.reduce((s, p) => s + p.amount, 0),
      penalties: u.penalties.map((p) => ({
        id: p.id,
        label: PENALTY_LABEL[p.type],
        amount: p.amount,
        note: p.note,
        dateLabel: formatDateTimeTz(p.createdAt),
      })),
      bonusTotal: u.bonuses.reduce((s, b) => s + b.amount, 0),
      bonuses: u.bonuses.map((b) => ({
        id: b.id,
        amount: b.amount,
        note: b.note,
        dateLabel: formatDateTimeTz(b.createdAt),
      })),
      goals: fields.goals.map((g) => ({
        id: g.id,
        title: g.title,
        percent: goalPercent(g),
        completed: isGoalComplete(g),
        deadlineLabel: g.deadline ? formatStamp(toStamp(g.deadline)) : null,
        incompleteReason: g.incompleteReason,
        subtasks: g.subtasks.map((s) => ({
          title: s.title,
          isDone: s.isDone,
        })),
      })),
      tasks: (tasksByUser.get(u.id) ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        note: t.note,
        deadlineLabel: t.deadline ? formatYmd(toYmd(t.deadline)) : null,
        done: t.completedAt != null,
      })),
    };
  }

  // The week split is anchored to the Sunday 12:00 deadline (see the cycle
  // computed above): weeks starting on/after it are "current"; earlier ones are
  // "previous". Comparing against the deadline instant (not the Monday) keeps
  // this robust to how week bounds are stored.
  const cutoff = cycle.submissionDeadline.getTime();
  // A redeploy race can leave a stray duplicate week for a cycle. When choosing
  // which one represents the person, a submitted week always beats an
  // unsubmitted duplicate, so someone who actually reported never reads as "not
  // submitted".
  const currentWeekOf = (weeks: (typeof rawUsers)[number]["weeks"]) => {
    const cur = weeks.filter((w) => w.startDate.getTime() >= cutoff);
    if (cur.length === 0) return null;
    const submitted = cur
      .filter((w) => w.submittedAt != null)
      .sort((a, b) => a.submittedAt!.getTime() - b.submittedAt!.getTime());
    if (submitted.length > 0) return submitted[0];
    return cur.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
  };
  const previousWeekOf = (weeks: (typeof rawUsers)[number]["weeks"]) => {
    const prev = weeks.filter((w) => w.startDate.getTime() < cutoff);
    if (prev.length === 0) return null;
    // Most recent previous week; a submitted duplicate wins a same-date tie.
    return prev.sort(
      (a, b) =>
        b.startDate.getTime() - a.startDate.getTime() ||
        Number(b.submittedAt != null) - Number(a.submittedAt != null),
    )[0];
  };

  // Current week = the week people must have goals in for this cycle.
  const usersCurrentWeek = rawUsers.map((u) => {
    const wk = currentWeekOf(u.weeks);
    return baseUser(u, {
      label: wk ? fmtRange(wk.startDate, wk.endDate) : null,
      late: wk?.submittedLate ?? false,
      submittedAt: wk?.submittedAt ?? null,
      misdated: false,
      goals: wk?.goals ?? [],
    });
  });

  // Previous week = the week that just wrapped. "Didn't close" = they never
  // started the next week (no current-cycle week), so they're stuck on it.
  const usersPreviousWeek = rawUsers.map((u) => {
    const wk = previousWeekOf(u.weeks);
    const closed = currentWeekOf(u.weeks) != null;
    return baseUser(u, {
      label: wk ? fmtRange(wk.startDate, wk.endDate) : null,
      late: wk?.submittedLate ?? false,
      submittedAt: wk?.submittedAt ?? null,
      misdated: false,
      notClosed: wk != null && !closed,
      goals: wk?.goals ?? [],
    });
  });

  const usersMonth = rawUsers.map((u) => {
    const m = u.months[0];
    return baseUser(u, {
      label: m ? monthLabel(m.startDate) : null,
      late: false,
      submittedAt: m?.submittedAt ?? null,
      misdated: false,
      goals: m?.goals ?? [],
    });
  });

  // This week's meeting attendance roster (everyone, with their current mark).
  const attStatus = new Map(
    currentMeeting?.attendances.map((a) => [a.userId, a.status]) ?? [],
  );
  const meetingFine = new Map(
    currentMeeting?.penalties.map((p) => [p.userId, p.amount]) ?? [],
  );
  const roster = rawUsers.map((u) => {
    const av = resolveAvatar(u.avatar, u.email ?? u.id);
    return {
      id: u.id,
      name: u.name ?? u.email ?? "—",
      emoji: av.emoji,
      bg: av.bg,
      status: attStatus.get(u.id) ?? null,
      fine: meetingFine.get(u.id) ?? null,
    };
  });
  const meetingLabel = formatDateTimeTz(currentMeetingSlot());

  // Attendance history: newest meeting on the left.
  const historyColumns = recentMeetings.map((m) =>
    formatYmd(toYmd(m.scheduledAt)),
  );
  const statusByMeetingUser = new Map(
    recentMeetings.flatMap((m, i) =>
      m.attendances.map((a) => [`${i}:${a.userId}`, a.status] as const),
    ),
  );
  const historyRows = rawUsers.map((u) => {
    const av = resolveAvatar(u.avatar, u.email ?? u.id);
    return {
      id: u.id,
      name: u.name ?? u.email ?? "—",
      emoji: av.emoji,
      bg: av.bg,
      cells: recentMeetings.map(
        (_, i) => statusByMeetingUser.get(`${i}:${u.id}`) ?? null,
      ),
    };
  });

  // Outstanding fines across everyone — settled fines are excluded (archived
  // on /penalties), so this tracks what the team still owes.
  const finesTotal = allPenalties.reduce((s, p) => s + p.amount, 0);

  // Per-tab aggregate stats. "Active" = has at least one goal in that period.
  function statsOf(list: AdminUser[]) {
    const active = list.filter((u) => u.goalCount > 0);
    return {
      activeCount: active.length,
      totalGoals: list.reduce((s, u) => s + u.goalCount, 0),
      totalCompleted: list.reduce((s, u) => s + u.completedCount, 0),
      avg: active.length
        ? Math.round(active.reduce((s, u) => s + u.percent, 0) / active.length)
        : 0,
    };
  }

  // How many people are still stuck on the previous week (never closed it).
  const notClosedCount = usersPreviousWeek.filter((u) => u.notClosed).length;

  // Assigned-goal tracking rows for the monitoring list.
  const assignedTaskRows = assignedTasks.map((t) => ({
    id: t.id,
    title: t.title,
    note: t.note,
    assigneeName: t.user.name ?? t.user.email ?? "—",
    scope: t.scope,
    scopeLabel: t.scope === "MONTHLY" ? "Monthly" : "Weekly",
    deadlineLabel: t.deadline ? formatYmd(toYmd(t.deadline)) : null,
    deadline: t.deadline ? toYmd(t.deadline) : null,
    done: t.completedAt != null,
    createdAtLabel: formatDateTimeTz(t.createdAt),
  }));

  const weekRange = fmtRange(weekStart, weekEnd);
  const monthRange = monthLabel(now);

  const subtitle =
    tab === "previous"
      ? "Last week's goals and who closed out their week."
      : tab === "month"
        ? `${monthRange} · monthly goals across everyone.`
        : tab === "perf"
          ? "All-time performance per person — goals, meetings, reliability."
          : `${weekRange} · this week's submitted goals and progress across everyone.`;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            Admin
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Team overview</h1>
          <p className="mt-1 text-sm text-muted-fg">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/review"
            className="inline-flex shrink-0 items-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-brand/40 hover:bg-canvas hover:text-brand"
          >
            Week in review
          </Link>
          <Link
            href="/dashboard"
            className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-brand/40 hover:bg-canvas hover:text-brand"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 transition-transform duration-200 ease-out group-hover:-translate-x-0.5"
              aria-hidden="true"
            >
              <path d="M11 5 4 12l7 7" />
              <path d="M4 12h16" />
            </svg>
            My dashboard
          </Link>
        </div>
      </header>

      <AdminTabs tab={tab} />

      {tab === "current" && (
        <>
          <StatStrip
            stats={[
              { label: "Users", value: rawUsers.length },
              { label: "Active this week", value: statsOf(usersCurrentWeek).activeCount },
              { label: "Goals set", value: statsOf(usersCurrentWeek).totalGoals },
              {
                label: "Goals completed",
                value: statsOf(usersCurrentWeek).totalCompleted,
              },
              { label: "Avg completion", value: `${statsOf(usersCurrentWeek).avg}%` },
              { label: "Outstanding", value: formatMoney(finesTotal) },
            ]}
          />

          <section className="mt-8">
            <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
              Monday meeting
            </h2>
            <p className="mb-3 px-1 text-xs text-muted-fg">
              {meetingLabel} · mark who skipped. Skips are fined automatically
              ($40, then +$20 for each meeting missed in a row).
            </p>
            <AttendancePanel meetingLabel={meetingLabel} roster={roster} />
            <div className="mt-3">
              <AttendanceHistory columns={historyColumns} rows={historyRows} />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
              People ({rawUsers.length})
            </h2>
            <AdminUserList
              users={usersCurrentWeek}
              currentUserId={session.user.id}
              variant="week"
            />
          </section>

          <section className="mt-8">
            <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
              Assigned goals
            </h2>
            <p className="mb-3 px-1 text-xs text-muted-fg">
              Progress on everything assigned. To assign a new goal, use
              &ldquo;Assign a goal&rdquo; in your dashboard&rsquo;s right
              sidebar — weekly or monthly.
            </p>
            <AssignedTasksPanel tasks={assignedTaskRows} />
          </section>

          <section className="mt-10">
            <h2 className="mb-3 px-1 text-sm font-semibold text-ink">Logs</h2>
            <div className="flex flex-col gap-2">
              <CollapsibleSection title="Fines" count={recentPenalties.length}>
                <p className="mb-3 text-xs text-muted-fg">
                  Fines issued to people. Add one from a person&rsquo;s row above.
                </p>
                <RecentPenalties
                  penalties={recentPenalties.map((p) => ({
                    id: p.id,
                    label: PENALTY_LABEL[p.type],
                    amount: p.amount,
                    note: p.note,
                    who: p.user.name ?? p.user.email ?? "—",
                    dateLabel: formatDateTimeTz(p.createdAt),
                  }))}
                />
              </CollapsibleSection>

              <CollapsibleSection title="Bonuses" count={recentBonuses.length}>
                <p className="mb-3 text-xs text-muted-fg">
                  Bonuses awarded to people. Add one from a person&rsquo;s row
                  above.
                </p>
                <RecentBonuses
                  bonuses={recentBonuses.map((b) => ({
                    id: b.id,
                    amount: b.amount,
                    note: b.note,
                    who: b.user.name ?? b.user.email ?? "—",
                    dateLabel: formatDateTimeTz(b.createdAt),
                  }))}
                />
              </CollapsibleSection>

              <CollapsibleSection
                title="Late submissions"
                count={lateWeeks.length}
              >
                <p className="mb-3 text-xs text-muted-fg">
                  Weeks closed and re-opened after the Sunday 12:00 (Tashkent)
                  deadline.
                </p>
                {lateWeeks.length === 0 ? (
                  <p className="text-sm text-muted-fg">No late submissions. 🎉</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lateWeeks.map((w) => (
                      <li
                        key={w.id}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4"
                      >
                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
                          Late
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {w.user.name ?? w.user.email ?? "—"}
                          </p>
                          <p className="truncate text-xs text-muted-fg">
                            Week {fmtRange(w.startDate, w.endDate)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-fg">
                          started {formatDateTimeTz(w.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleSection>

              <CollapsibleSection title="Feedback" count={feedback.length}>
                {feedback.length === 0 ? (
                  <p className="text-sm text-muted-fg">No feedback yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {feedback.map((f) => (
                      <li
                        key={f.id}
                        className="rounded-xl border border-line bg-surface p-4"
                      >
                        <p className="whitespace-pre-wrap text-sm text-ink">
                          {f.message}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-fg">
                          <span>{f.userEmail ?? "anonymous"}</span>
                          <span>·</span>
                          <span>
                            {f.createdAt.toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleSection>
            </div>
          </section>
        </>
      )}

      {tab === "previous" && (
        <>
          <StatStrip
            stats={[
              { label: "Users", value: rawUsers.length },
              {
                label: "Didn't close",
                value: `${notClosedCount}/${rawUsers.length}`,
              },
              { label: "Goals set", value: statsOf(usersPreviousWeek).totalGoals },
              {
                label: "Goals completed",
                value: statsOf(usersPreviousWeek).totalCompleted,
              },
              { label: "Avg completion", value: `${statsOf(usersPreviousWeek).avg}%` },
            ]}
          />
          <section className="mt-8">
            <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
              People ({rawUsers.length})
            </h2>
            <p className="mb-3 px-1 text-xs text-muted-fg">
              Last week&rsquo;s goals and how they landed. Anyone who never
              closed the week out is flagged &ldquo;Didn&rsquo;t close.&rdquo;
            </p>
            <AdminUserList
              users={usersPreviousWeek}
              currentUserId={session.user.id}
              variant="previous-week"
            />
          </section>
        </>
      )}

      {tab === "perf" && perf && (
        <>
          <StatStrip
            stats={[
              {
                label: "Team score",
                value: perf.team.avgScore != null ? perf.team.avgScore : "—",
              },
              {
                label: "Avg completion",
                value:
                  perf.team.avgCompletion != null
                    ? `${perf.team.avgCompletion}%`
                    : "—",
              },
              {
                label: "Attendance",
                value:
                  perf.team.attendanceRate != null
                    ? `${perf.team.attendanceRate}%`
                    : "—",
              },
              {
                label: "On-time reports",
                value:
                  perf.team.onTimeRate != null
                    ? `${perf.team.onTimeRate}%`
                    : "—",
              },
              { label: "Bonuses", value: formatMoney(perf.team.bonusTotal) },
              { label: "Fines", value: formatMoney(perf.team.fineTotal) },
            ]}
          />
          <section className="mt-8">
            <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
              People ({perf.employees.length})
            </h2>
            <p className="mb-3 px-1 text-xs text-muted-fg">
              Ranked by composite score — 50% goal completion, 25% meeting
              attendance, 25% on-time reporting. Completion averages cover
              closed weeks and months only, so the current period doesn&rsquo;t
              drag anyone down mid-week. People with no closed weeks yet
              aren&rsquo;t scored and rank last until they close one.
            </p>
            <PerformancePanel employees={perf.employees} />
          </section>
        </>
      )}

      {tab === "month" && (
        <>
          <StatStrip
            stats={[
              { label: "Users", value: rawUsers.length },
              { label: "Active this month", value: statsOf(usersMonth).activeCount },
              { label: "Goals set", value: statsOf(usersMonth).totalGoals },
              { label: "Goals completed", value: statsOf(usersMonth).totalCompleted },
              { label: "Avg completion", value: `${statsOf(usersMonth).avg}%` },
            ]}
          />
          <section className="mt-8">
            <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
              People ({rawUsers.length})
            </h2>
            <AdminUserList
              users={usersMonth}
              currentUserId={session.user.id}
              variant="month"
            />
          </section>
        </>
      )}
    </div>
  );
}

// The period's numbers as one quiet strip between hairlines — no tile boxes.
function StatStrip({
  stats,
}: {
  stats: { label: string; value: string | number }[];
}) {
  return (
    <section className="flex flex-wrap gap-x-10 gap-y-4 border-y border-line px-1 py-4">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="text-xl font-semibold tabular-nums text-ink">
            {s.value}
          </div>
          <div className="mt-0.5 text-xs text-muted-fg">{s.label}</div>
        </div>
      ))}
    </section>
  );
}
