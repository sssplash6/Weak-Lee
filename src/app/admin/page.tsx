import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { goalPercent, isGoalComplete, weekPercent } from "@/lib/progress";
import { getWeekBounds } from "@/lib/weeks";
import { currentMeetingSlot } from "@/lib/meetings";
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

  const tabParam = (await searchParams).tab;
  const tab: AdminTab =
    tabParam === "next" ? "next" : tabParam === "month" ? "month" : "this";

  const now = new Date();

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
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        avatar: true,
        // The three most recent weeks, newest first — enough to pick out the
        // week we're in now (latest that has started) and any future "next"
        // week the person opened by reporting early.
        weeks: {
          orderBy: { startDate: "desc" },
          take: 3,
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
        penalties: {
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
        deadline: true,
        completedAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    // Every penalty, uncapped. Feeds the "Total fines" stat, which must not
    // miss entries the capped recent-penalties list drops.
    prisma.penalty.findMany({ select: { amount: true } }),
  ]);

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

  // This week = the latest week that has already started (NOT the isCurrent
  // flag: someone who reported early has a future-dated week marked current).
  const usersThisWeek = rawUsers.map((u) => {
    const wk = u.weeks.find((w) => w.startDate.getTime() <= now.getTime());
    return baseUser(u, {
      label: wk ? fmtRange(wk.startDate, wk.endDate) : null,
      late: wk?.submittedLate ?? false,
      submittedAt: wk?.submittedAt ?? null,
      misdated: false,
      goals: wk?.goals ?? [],
    });
  });

  // Next week = the future-dated week someone opened by reporting early (if
  // any). Having one — reflected as "Reported" — is the whole point of this tab.
  const usersNextWeek = rawUsers.map((u) => {
    const future = u.weeks
      .filter((w) => w.startDate.getTime() > now.getTime())
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
    return baseUser(u, {
      label: future ? fmtRange(future.startDate, future.endDate) : null,
      late: future?.submittedLate ?? false,
      submittedAt: future?.submittedAt ?? null,
      // Surfaces the "move back to current week" fix for early reporters.
      misdated: future != null,
      goals: future?.goals ?? [],
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

  // Every penalty ever issued — fines, late submissions, meeting skips/lates.
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

  const reportedCount = usersNextWeek.filter((u) => u.misdated).length;

  // Assigned-task tracking data + the person picker for the assign form.
  const assignPeople = rawUsers.map((u) => ({
    id: u.id,
    name: u.name ?? u.email ?? "—",
  }));
  const assignedTaskRows = assignedTasks.map((t) => ({
    id: t.id,
    title: t.title,
    note: t.note,
    assigneeName: t.user.name ?? t.user.email ?? "—",
    deadlineLabel: t.deadline ? formatYmd(toYmd(t.deadline)) : null,
    done: t.completedAt != null,
    createdAtLabel: formatDateTimeTz(t.createdAt),
  }));

  const weekRange = fmtRange(weekStart, weekEnd);
  const monthRange = monthLabel(now);

  const subtitle =
    tab === "next"
      ? "Who has closed and reported their week, and what they planned next."
      : tab === "month"
        ? `${monthRange} · monthly goals across everyone.`
        : `${weekRange} · this week's submitted goals and progress across everyone.`;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy · Admin
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Team overview</h1>
          <p className="mt-1 text-sm text-muted-fg">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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

      {tab === "this" && (
        <>
          <StatStrip
            stats={[
              { label: "Users", value: rawUsers.length },
              { label: "Active this week", value: statsOf(usersThisWeek).activeCount },
              { label: "Goals set", value: statsOf(usersThisWeek).totalGoals },
              {
                label: "Goals completed",
                value: statsOf(usersThisWeek).totalCompleted,
              },
              { label: "Avg completion", value: `${statsOf(usersThisWeek).avg}%` },
              { label: "Total fines", value: formatMoney(finesTotal) },
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
              users={usersThisWeek}
              currentUserId={session.user.id}
              variant="week"
            />
          </section>

          <section className="mt-8">
            <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
              Assign &amp; track goals
            </h2>
            <p className="mb-3 px-1 text-xs text-muted-fg">
              Give someone a goal to work on. It shows up in their &ldquo;Assigned
              to you&rdquo; list, separate from their own weekly goals.
            </p>
            <AssignedTasksPanel people={assignPeople} tasks={assignedTaskRows} />
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

      {tab === "next" && (
        <>
          <StatStrip
            stats={[
              { label: "Reported", value: `${reportedCount}/${rawUsers.length}` },
              { label: "Goals planned", value: statsOf(usersNextWeek).totalGoals },
              { label: "Avg planned", value: `${statsOf(usersNextWeek).avg}%` },
            ]}
          />
          <section className="mt-8">
            <h2 className="mb-1 px-1 text-sm font-semibold text-ink">
              Reports ({rawUsers.length})
            </h2>
            <p className="mb-3 px-1 text-xs text-muted-fg">
              Reporting closes the week and plans the next one — everyone
              who&rsquo;s done that shows as reported, with their next-week goals.
            </p>
            <AdminUserList
              users={usersNextWeek}
              currentUserId={session.user.id}
              variant="next-week"
            />
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
