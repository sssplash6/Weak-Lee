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
import { PeriodToggle } from "../dashboard/_components/PeriodToggle";
import { AdminUserList, type AdminUser } from "./_components/AdminUserList";
import { RecentPenalties } from "./_components/RecentPenalties";
import { AttendancePanel } from "./_components/AttendancePanel";
import { AttendanceHistory } from "./_components/AttendanceHistory";

// Render week ranges by their UTC calendar date (matching how week bounds are
// stored) so the dates don't drift by the viewer's timezone.
function fmtRange(start: Date, end: Date): string {
  return `${formatYmd(toYmd(start))} – ${formatYmd(toYmd(end))}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const session = await auth();
  // Gate: must be signed in AND an admin. Everyone else goes to the dashboard.
  if (!session?.user?.id) redirect("/signin");
  if (!isAdmin(session.user.email)) redirect("/dashboard");

  // Which period the People section shows: weekly goals (default) or monthly.
  // Everything else on this page (stats, meeting, fines) stays week-based.
  const view = (await searchParams).view === "month" ? "month" : "week";
  const isMonth = view === "month";

  const [
    rawUsers,
    feedback,
    lateWeeks,
    recentPenalties,
    currentMeeting,
    recentMeetings,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        avatar: true,
        createdAt: true,
        weeks: {
          where: { isCurrent: true },
          select: {
            startDate: true,
            endDate: true,
            submittedLate: true,
            submittedAt: true,
            goals: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                title: true,
                completedAt: true,
                deadline: true,
                manualPercent: true,
                incompleteReason: true,
                subtasks: { select: { isDone: true } },
              },
            },
          },
        },
        // Months are created lazily when someone first opens the month view,
        // so a user may have no current month — they render as "no goals".
        months: {
          where: { isCurrent: true },
          select: {
            startDate: true,
            submittedAt: true,
            goals: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                title: true,
                completedAt: true,
                deadline: true,
                manualPercent: true,
                incompleteReason: true,
                subtasks: { select: { isDone: true } },
              },
            },
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
    // strip. Each week is its own meeting row, so this is the stored record of
    // past weeks even though the marking sheet always shows just the current one.
    prisma.meeting.findMany({
      orderBy: { scheduledAt: "desc" },
      take: 8,
      select: {
        scheduledAt: true,
        attendances: { select: { userId: true, status: true } },
      },
    }),
  ]);

  // The current calendar week's Monday — used to flag users whose active week is
  // dated ahead of it (e.g. the launch "start next week" artifact).
  const thisWeekStart = getWeekBounds(new Date()).start;

  const users: AdminUser[] = rawUsers.map((u) => {
    const week = u.weeks[0];
    const period = isMonth ? u.months[0] : week;
    const goals = period?.goals ?? [];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department,
      avatar: u.avatar,
      weekLabel: isMonth
        ? period
          ? monthLabel(period.startDate)
          : null
        : week
          ? fmtRange(week.startDate, week.endDate)
          : null,
      // Misdated weeks and late submissions are week-only concepts: months are
      // always whole calendar months and have no submission deadline.
      misdated:
        !isMonth && week
          ? week.startDate.getTime() > thisWeekStart.getTime()
          : false,
      late: !isMonth && (week?.submittedLate ?? false),
      submittedAtLabel: period?.submittedAt
        ? formatDateTimeTz(period.submittedAt)
        : null,
      percent: weekPercent(goals),
      goalCount: goals.length,
      completedCount: goals.filter(isGoalComplete).length,
      penaltyTotal: u.penalties.reduce((s, p) => s + p.amount, 0),
      penalties: u.penalties.map((p) => ({
        id: p.id,
        label: PENALTY_LABEL[p.type],
        amount: p.amount,
        note: p.note,
        dateLabel: formatDateTimeTz(p.createdAt),
      })),
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        percent: goalPercent(g),
        completed: isGoalComplete(g),
        deadlineLabel: g.deadline ? formatStamp(toStamp(g.deadline)) : null,
        incompleteReason: g.incompleteReason,
      })),
    };
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

  // Attendance history: oldest → newest across the recent meetings. Each cell is
  // a person's status for that meeting (null if never marked that week).
  const meetingsChrono = [...recentMeetings].reverse();
  const historyColumns = meetingsChrono.map((m) =>
    formatYmd(toYmd(m.scheduledAt)),
  );
  const statusByMeetingUser = new Map(
    meetingsChrono.flatMap((m, i) =>
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
      cells: meetingsChrono.map(
        (_, i) => statusByMeetingUser.get(`${i}:${u.id}`) ?? null,
      ),
    };
  });

  // Aggregate stats. "Active" = has at least one goal in the current week.
  const active = users.filter((u) => u.goalCount > 0);
  const totalGoals = users.reduce((s, u) => s + u.goalCount, 0);
  const totalCompleted = users.reduce((s, u) => s + u.completedCount, 0);
  const avgCompletion = active.length
    ? Math.round(active.reduce((s, u) => s + u.percent, 0) / active.length)
    : 0;

  // Fines issued this calendar week (by when they were recorded).
  const finesThisWeek = recentPenalties
    .filter((p) => p.createdAt.getTime() >= thisWeekStart.getTime())
    .reduce((s, p) => s + p.amount, 0);

  const stats = [
    { label: "Users", value: users.length },
    { label: `Active this ${view}`, value: active.length },
    { label: "Goals set", value: totalGoals },
    { label: "Goals completed", value: totalCompleted },
    { label: "Avg completion", value: `${avgCompletion}%` },
    { label: "Fines this week", value: formatMoney(finesThisWeek) },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy · Admin
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Team overview</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {isMonth ? "Monthly" : "Weekly"} goals and progress across everyone.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/admin/review"
          className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Review this week
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

      <PeriodToggle view={view} basePath="/admin" />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <div className="text-2xl font-bold tabular-nums text-ink">
              {s.value}
            </div>
            <div className="mt-1 text-xs font-medium text-muted-fg">
              {s.label}
            </div>
          </div>
        ))}
      </section>

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
          People ({users.length})
        </h2>
        <AdminUserList
          users={users}
          currentUserId={session.user.id}
          periodNoun={view}
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
          Penalties ({recentPenalties.length})
        </h2>
        <p className="mb-3 px-1 text-xs text-muted-fg">
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
      </section>

      <section className="mt-10">
        <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
          Late submissions ({lateWeeks.length})
        </h2>
        <p className="mb-3 px-1 text-xs text-muted-fg">
          Weeks closed and re-opened after the Sunday 12:00 (Tashkent) deadline.
        </p>
        {lateWeeks.length === 0 ? (
          <p className="px-1 text-sm text-muted-fg">
            No late submissions. 🎉
          </p>
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
      </section>

      <section className="mt-10">
        <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
          Recent feedback ({feedback.length})
        </h2>
        {feedback.length === 0 ? (
          <p className="px-1 text-sm text-muted-fg">No feedback yet.</p>
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
      </section>
    </div>
  );
}
