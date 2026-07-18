import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Dashboard" };
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
import { AssignGoalButton } from "./_components/AssignGoalButton";
import { AssignedByMe } from "./_components/AssignedByMe";
import { PeriodToggle } from "./_components/PeriodToggle";
import { PENALTY_LABEL } from "@/lib/penalties";
import { MAX_GOALS } from "@/lib/goals";

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
    assignedByMe,
    recentNotifications,
    olderUnreadNotifications,
    unreadCount,
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
          paidAt: true,
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
          scope: true,
          deadline: true,
          completedAt: true,
        },
      }),
      // Goals this user has assigned to others — shown beneath their fines.
      prisma.assignedTask.findMany({
        where: { assignedById: userId },
        orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          note: true,
          scope: true,
          deadline: true,
          completedAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.notification.findMany({
        where: { userId, createdAt: { gte: updatesSince } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          type: true,
          message: true,
          createdAt: true,
          readAt: true,
        },
      }),
      // Unread notifications older than the 48-hour window — the badge counts
      // them, so the dropdown must surface them too (below the recent list).
      prisma.notification.findMany({
        where: { userId, readAt: null, createdAt: { lt: updatesSince } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          message: true,
          createdAt: true,
          readAt: true,
        },
      }),
      // Unread notifications of any age — the bell badge counts these, so an
      // unread fine older than 48 hours doesn't silently drop off the badge.
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

  // The user's own fines. Only *outstanding* (unpaid) fines drive the money
  // block — once a fine is settled (cut from salary) it drops out, so the
  // figure reflects what they actually still owe. Settled fines are summed
  // separately as a "paid to date" note. This week's outstanding fines are
  // broken out front-and-centre (week view only — fines are week-scoped).
  // A fine's "date" is the meeting it relates to (for skips) or when it was
  // recorded (late submissions / manual fines).
  const activePenalties = penalties.filter((p) => p.paidAt == null);
  const outstandingTotal = activePenalties.reduce((s, p) => s + p.amount, 0);
  const paidTotal = penalties
    .filter((p) => p.paidAt != null)
    .reduce((s, p) => s + p.amount, 0);
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
  const weekPenalties = activePenalties.filter(inThisWeek).map(toRow);
  // Earlier outstanding fines are itemised too (not just summed) so the reason
  // for every unpaid fine stays visible, not only this week's.
  const earlierPenalties = activePenalties
    .filter((p) => !inThisWeek(p))
    .map(toRow);
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
    unread: n.readAt == null,
  }));

  // Older unread ones — everything the badge counts is listed somewhere.
  const olderUnread = olderUnreadNotifications.map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    dateLabel: formatDateTimeTz(n.createdAt),
    unread: true,
  }));

  // Admin-assigned tasks — shown as a standalone list, not part of week %.
  // Weekly-scoped ones surface on the week view, monthly ones on the month view.
  const assignedTaskViews = assignedTasks
    .filter((t) => (t.scope === "MONTHLY") === isMonth)
    .map((t) => ({
      id: t.id,
      title: t.title,
      note: t.note,
      deadlineLabel: t.deadline ? formatYmd(toYmd(t.deadline)) : null,
      done: t.completedAt != null,
    }));

  // Goals this user handed to others (both scopes), pending first.
  const assignedByMeViews = assignedByMe.map((t) => ({
    id: t.id,
    title: t.title,
    recipient: displayName(t.user),
    scope: t.scope,
    deadlineLabel: t.deadline ? formatYmd(toYmd(t.deadline)) : null,
    deadline: t.deadline ? toYmd(t.deadline) : null,
    note: t.note,
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

  // Candidates to carry into the new week — every current goal, with unfinished
  // ones pre-checked in the Start-new-week dialog.
  const carryGoals = period.goals.map((g) => {
    const percent = goalPercent(g);
    return { id: g.id, title: g.title, percent, done: percent === 100 };
  });

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
    sharedTo: goal.sharesOut.map((sh) => displayName(sh.toUser)),
    receivedFrom: goal.shareIn ? displayName(goal.shareIn.fromUser) : null,
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

  // Goals delegated to this user by a teammate move into the Inbox section
  // instead of the main list — but they're still real goals in the period, so
  // they keep counting toward the week/month percent.
  const inboxGoals = goals.filter((g) => g.receivedFrom);
  const ownGoals = goals.filter((g) => !g.receivedFrom);

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

  // The user's own money block — fines (week view only) and bonuses. Lives in
  // the left sidebar on desktop; on smaller screens (no sidebar) it renders at
  // the top of the main column instead.
  const moneyNotices =
    (!isMonth && outstandingTotal > 0) || bonusTotal > 0 ? (
      <>
        {!isMonth && outstandingTotal > 0 && (
          <PenaltyNotice
            weekPenalties={weekPenalties}
            earlierPenalties={earlierPenalties}
            weekTotal={weekPenaltyTotal}
            outstandingTotal={outstandingTotal}
            paidTotal={paidTotal}
          />
        )}
        {bonusTotal > 0 && <BonusNotice bonuses={bonusRows} total={bonusTotal} />}
      </>
    ) : null;

  return (
    <>
      {/* Entry alert: nags until this period's goals are submitted once. */}
      {period.submittedAt == null && <SubmitReminder scope={view} />}

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-8">
          <WeekArchive weeks={archive} periodNoun={view} />
          {moneyNotices && (
            <div className="mt-6 flex flex-col gap-3">{moneyNotices}</div>
          )}
          {assignedByMeViews.length > 0 && (
            <div className="mt-6">
              <AssignedByMe items={assignedByMeViews} />
            </div>
          )}
          {isAdmin(session!.user.email) && (
            <div className="mt-72">
              <AssignGoalButton people={team} />
            </div>
          )}
        </div>
      </aside>

      <main className="flex w-full min-w-0 max-w-3xl flex-1 flex-col">
        <header className="mb-6 flex items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="mt-1 text-xl font-bold text-ink sm:text-2xl">
            {isMonth
              ? monthLabel(period.startDate)
              : formatRange(period.startDate, period.endDate)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <WeekProgress percent={overall} label={isMonth ? "Month" : "Week"} />
          <div className="flex items-center gap-2">
            <NotificationsBell
              updates={updates}
              olderUnread={olderUnread}
              unreadCount={unreadCount}
            />
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

      {moneyNotices && (
        <div
          className={`mb-5 grid items-start gap-3 lg:hidden ${
            !isMonth && outstandingTotal > 0 && bonusTotal > 0
              ? "sm:grid-cols-2"
              : ""
          }`}
        >
          {moneyNotices}
        </div>
      )}

      {assignedByMeViews.length > 0 && (
        <div className="mb-5 lg:hidden">
          <AssignedByMe items={assignedByMeViews} />
        </div>
      )}

      {isAdmin(session!.user.email) && (
        <div className="mb-5 lg:hidden">
          <AssignGoalButton people={team} />
        </div>
      )}

      {(inboxGoals.length > 0 || assignedTaskViews.length > 0) && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Inbox</h2>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-fg">
              {inboxGoals.length + assignedTaskViews.length}
            </span>
            <span className="text-xs text-muted-fg">from your team</span>
          </div>

          <AssignedTasks tasks={assignedTaskViews} />

          {inboxGoals.length > 0 && (
            <div className="flex flex-col gap-4">
              {inboxGoals.map((goal, i) => (
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
            </div>
          )}
        </section>
      )}

      <WeekSubmit
        scope={view}
        locked={locked}
        submittedAtLabel={submittedAtLabel}
        goalCount={goals.length}
      />

      <section className="flex flex-col gap-4">
        {ownGoals.map((goal, i) => (
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
            nextIndex={ownGoals.length + 1}
            todayYmd={todayYmd}
            scope={view}
            atCap={ownGoals.length >= MAX_GOALS}
          />
        )}

        {ownGoals.length === 0 && (
          <p className="px-1 text-sm text-muted-fg">
            Add your goals for the {view}, then break each one into subtasks.
          </p>
        )}
      </section>

      {/* Both sidebars are hidden on narrow screens (archive below lg, calendar
          below xl); surface their content inline so nothing is lost on mobile. */}
      <div className="mt-8 lg:hidden">
        <WeekArchive weeks={archive} periodNoun={view} />
      </div>
      <div className="mt-8 xl:hidden">
        <WeekCalendar deadlines={deadlineDots} />
      </div>

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
              carryGoals={carryGoals}
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
