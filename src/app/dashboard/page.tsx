import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isProfileComplete } from "@/lib/profile";
import { isAdmin } from "@/lib/admin";
import { ensureAvatar } from "@/lib/assignAvatar";
import {
  getArchivedWeeks,
  getOrCreateCurrentWeek,
  nextWeekBounds,
} from "@/lib/weeks";
import {
  getArchivedMonths,
  getOrCreateCurrentMonth,
  monthLabel,
  nextMonthBounds,
} from "@/lib/months";
import {
  goalPercent,
  isGoalComplete,
  needsCompletionReason,
  weekPercent,
} from "@/lib/progress";
import { formatDateTimeTz, formatYmd, toStamp, toYmd } from "@/lib/dates";
import type { Priority } from "@/lib/priority";
import { GoalCard } from "./_components/GoalCard";
import { AddGoalCard } from "./_components/AddGoalCard";
import { ProfileMenu } from "./_components/ProfileMenu";
import { WeekProgress } from "./_components/WeekProgress";
import { StartNewWeekButton } from "./_components/StartNewWeekButton";
import { StartNewMonthButton } from "./_components/StartNewMonthButton";
import { FeedbackButton } from "./_components/FeedbackButton";
import { WeekArchive } from "./_components/WeekArchive";
import { WeekCalendar } from "./_components/WeekCalendar";
import { WeekSubmit } from "./_components/WeekSubmit";
import { PenaltyNotice } from "./_components/PenaltyNotice";
import { NotificationsBell } from "./_components/NotificationsBell";
import { SubmitReminder } from "./_components/SubmitReminder";
import { BonusNotice } from "./_components/BonusNotice";
import { AssignedTasks } from "./_components/AssignedTasks";
import { PeriodToggle } from "./_components/PeriodToggle";
import { PENALTY_LABEL } from "@/lib/penalties";

// Render by the UTC calendar date the bounds were stored at, so the week label
// doesn't drift by the viewer's timezone.
function formatRange(start: Date, end: Date): string {
  return `${formatYmd(toYmd(start))} – ${formatYmd(toYmd(end))}`;
}

function displayName(u: { name: string | null; email: string | null }): string {
  return u.name ?? u.email ?? "Someone";
}

/** A Date → "YYYY-MM-DD" using its local calendar day (matches week bounds). */
function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const session = await auth();
  const userId = session!.user.id;

  // Which period the dashboard shows: weekly goals (default) or monthly ones.
  const view = (await searchParams).view === "month" ? "month" : "week";
  const isMonth = view === "month";

  // Require a completed profile before showing the dashboard.
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      workPhone: true,
      telegramUsername: true,
      department: true,
      birthday: true,
      avatar: true,
    },
  });
  if (!profile || !isProfileComplete(profile)) redirect("/onboarding");

  // Backfill a unique avatar for users created before avatars existed.
  const avatar =
    profile.avatar ?? (await ensureAvatar(userId, session!.user.email));

  // Animals already taken (by anyone) — used to grey out the picker.
  const takenAvatars = (
    await prisma.user.findMany({
      where: { avatar: { not: null } },
      select: { avatar: true },
    })
  ).map((u) => u.avatar as string);

  // The updates zone shows everything from the last 48 hours.
  const updatesSince = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [
    period,
    members,
    archivedPeriods,
    penalties,
    bonuses,
    assignedTasks,
    recentNotifications,
  ] = await Promise.all([
      isMonth ? getOrCreateCurrentMonth(userId) : getOrCreateCurrentWeek(userId),
      prisma.user.findMany({
        where: { id: { not: userId } },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      }),
      isMonth ? getArchivedMonths(userId) : getArchivedWeeks(userId),
      prisma.penalty.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          amount: true,
          note: true,
          createdAt: true,
          meeting: { select: { scheduledAt: true } },
        },
      }),
      prisma.bonus.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, amount: true, note: true, createdAt: true },
      }),
      prisma.assignedTask.findMany({
        where: { userId },
        orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          note: true,
          deadline: true,
          completedAt: true,
        },
      }),
      prisma.notification.findMany({
        where: { userId, createdAt: { gte: updatesSince } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, type: true, message: true, createdAt: true },
      }),
    ]);

  // The user's own fines: a running total, plus this week's broken out so
  // they're shown front-and-centre (week view only — fines are week-scoped).
  // A fine's "date" is the meeting it relates to (for skips) or when it was
  // recorded (late submissions / manual fines).
  const penaltyTotal = penalties.reduce((s, p) => s + p.amount, 0);
  const periodStartMs = period.startDate.getTime();
  const periodEndMs = period.endDate.getTime();
  const penaltyDate = (p: (typeof penalties)[number]) =>
    p.meeting?.scheduledAt ?? p.createdAt;
  const toRow = (p: (typeof penalties)[number]) => ({
    id: p.id,
    label: PENALTY_LABEL[p.type],
    amount: p.amount,
    note: p.note,
    dateLabel: formatDateTimeTz(penaltyDate(p)),
  });
  const inThisWeek = (p: (typeof penalties)[number]) => {
    const d = penaltyDate(p).getTime();
    return d >= periodStartMs && d <= periodEndMs;
  };
  const weekPenalties = penalties.filter(inThisWeek).map(toRow);
  // Earlier fines are itemised too (not just summed) so the reason for every
  // fine stays visible to the person, not only this week's.
  const earlierPenalties = penalties.filter((p) => !inThisWeek(p)).map(toRow);
  const weekPenaltyTotal = weekPenalties.reduce((s, p) => s + p.amount, 0);

  // The user's own bonuses — tracked separately from fines (no netting), shown
  // alongside them so the person sees both. Not period-scoped.
  const bonusTotal = bonuses.reduce((s, b) => s + b.amount, 0);
  const bonusRows = bonuses.map((b) => ({
    id: b.id,
    amount: b.amount,
    note: b.note,
    dateLabel: formatDateTimeTz(b.createdAt),
  }));

  // Notifications from the last 48 hours, for the header bell.
  const updates = recentNotifications.map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    dateLabel: formatDateTimeTz(n.createdAt),
  }));

  // Admin-assigned tasks — shown as a standalone list, not part of week %.
  const assignedTaskViews = assignedTasks.map((t) => ({
    id: t.id,
    title: t.title,
    note: t.note,
    deadlineLabel: t.deadline ? formatYmd(toYmd(t.deadline)) : null,
    done: t.completedAt != null,
  }));

  const overall = weekPercent(period.goals);
  const locked = period.goalsLocked;
  const submittedAtLabel = period.submittedAt
    ? formatDateTimeTz(period.submittedAt)
    : null;

  // Every goal below 100% at close needs a reflection reason — including ones
  // marked complete at a partial rate, not just unfinished ones.
  const incompleteGoals = period.goals
    .filter((g) => needsCompletionReason(g))
    .map((g) => ({ id: g.id, title: g.title, percent: goalPercent(g) }));

  const now = new Date();
  const todayYmd = toYmd(now);
  const nowStamp = toStamp(now);

  // Default date range for the next week (editable in the Start-new-week
  // dialog); the next month is fixed — always the following calendar month.
  const nextWeek = nextWeekBounds(period.endDate);
  const defaultWeekStart = toLocalYmd(nextWeek.start);
  const defaultWeekEnd = toLocalYmd(nextWeek.end);
  const nextMonthName = monthLabel(nextMonthBounds(period.endDate).start);

  // Open goals due on each day, keyed by "YYYY-MM-DD", as a list of their
  // priorities (null = no flag) so the calendar can color each dot.
  const deadlineDots: Record<string, (Priority | null)[]> = {};
  for (const g of period.goals) {
    if (g.deadline && !isGoalComplete(g)) {
      const key = toYmd(g.deadline);
      (deadlineDots[key] ??= []).push(g.priority ?? null);
    }
  }

  // Flatten to a serializable shape for the client components.
  const goals = period.goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    completed: isGoalComplete(goal),
    deadline: goal.deadline ? toStamp(goal.deadline) : null,
    priority: goal.priority ?? null,
    manualPercent: goal.manualPercent,
    subtasks: goal.subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      isDone: s.isDone,
      sharedTo: s.sharesOut.map((sh) => displayName(sh.toUser)),
      receivedFrom: s.shareIn ? displayName(s.shareIn.fromUser) : null,
    })),
  }));

  // Completed goals sink to the bottom automatically. Array.sort is stable, so
  // position order is preserved within the open and completed groups. This is
  // display-only — the stored `position` is untouched, so reopening a goal
  // returns it to its original spot.
  goals.sort((a, b) => Number(a.completed) - Number(b.completed));

  const team = members.map((m) => ({ id: m.id, name: displayName(m) }));

  const archive = archivedPeriods.map((p) => ({
    id: p.id,
    label: isMonth ? monthLabel(p.startDate) : formatRange(p.startDate, p.endDate),
    percent: weekPercent(p.goals),
    goals: p.goals.map((g) => ({
      id: g.id,
      title: g.title,
      percent: goalPercent(g),
      completed: isGoalComplete(g),
      incompleteReason: g.incompleteReason,
      subtasks: g.subtasks.map((s) => ({
        id: s.id,
        title: s.title,
        isDone: s.isDone,
      })),
    })),
  }));

  return (
    <>
      {/* Entry alert: nags until this period's goals are submitted once. */}
      {period.submittedAt == null && <SubmitReminder scope={view} />}

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-8">
          <WeekArchive weeks={archive} periodNoun={view} />
        </div>
      </aside>

      <main className="flex w-full min-w-0 max-w-3xl flex-1 flex-col">
        <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            {isMonth
              ? monthLabel(period.startDate)
              : formatRange(period.startDate, period.endDate)}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <WeekProgress percent={overall} label={isMonth ? "Month" : "Week"} />
          <div className="flex items-center gap-2">
            <NotificationsBell updates={updates} />
            <ProfileMenu
              name={session!.user.name}
              email={session!.user.email}
              avatar={avatar}
              takenAvatars={takenAvatars}
              isAdmin={isAdmin(session!.user.email)}
            />
          </div>
        </div>
      </header>

      <PeriodToggle view={view} />

      {((!isMonth && penaltyTotal > 0) || bonusTotal > 0) && (
        <div
          className={`mb-5 grid items-start gap-3 ${
            !isMonth && penaltyTotal > 0 && bonusTotal > 0
              ? "sm:grid-cols-2"
              : ""
          }`}
        >
          {!isMonth && penaltyTotal > 0 && (
            <PenaltyNotice
              weekPenalties={weekPenalties}
              earlierPenalties={earlierPenalties}
              weekTotal={weekPenaltyTotal}
              allTimeTotal={penaltyTotal}
            />
          )}
          {bonusTotal > 0 && (
            <BonusNotice bonuses={bonusRows} total={bonusTotal} />
          )}
        </div>
      )}

      <AssignedTasks tasks={assignedTaskViews} />

      <WeekSubmit
        scope={view}
        locked={locked}
        submittedAtLabel={submittedAtLabel}
        goalCount={goals.length}
      />

      <section className="flex flex-col gap-4">
        {goals.map((goal, i) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            index={i + 1}
            team={team}
            todayYmd={todayYmd}
            nowStamp={nowStamp}
            locked={locked}
          />
        ))}

        {!locked && (
          <AddGoalCard
            nextIndex={goals.length + 1}
            todayYmd={todayYmd}
            scope={view}
          />
        )}

        {goals.length === 0 && (
          <p className="px-1 text-sm text-muted-fg">
            Add your goals for the {view}, then break each one into subtasks.
          </p>
        )}
      </section>

        <footer className="mt-10 border-t border-line pt-6">
          {isMonth ? (
            <StartNewMonthButton
              incompleteGoals={incompleteGoals}
              nextMonthLabel={nextMonthName}
              todayYmd={todayYmd}
            />
          ) : (
            <StartNewWeekButton
              incompleteGoals={incompleteGoals}
              defaultStart={defaultWeekStart}
              defaultEnd={defaultWeekEnd}
            />
          )}
        </footer>
      </main>

      <aside className="hidden w-64 shrink-0 xl:block">
        <div className="sticky top-8">
          <WeekCalendar deadlines={deadlineDots} />
        </div>
      </aside>

      <FeedbackButton />
      </div>
    </>
  );
}
