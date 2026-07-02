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
import { goalPercent, isGoalComplete, weekPercent } from "@/lib/progress";
import { formatDateTimeTz, formatYmd, toStamp, toYmd } from "@/lib/dates";
import type { Priority } from "@/lib/priority";
import { GoalCard } from "./_components/GoalCard";
import { AddGoalCard } from "./_components/AddGoalCard";
import { ProfileMenu } from "./_components/ProfileMenu";
import { WeekProgress } from "./_components/WeekProgress";
import { StartNewWeekButton } from "./_components/StartNewWeekButton";
import { FeedbackButton } from "./_components/FeedbackButton";
import { WeekArchive } from "./_components/WeekArchive";
import { WeekCalendar } from "./_components/WeekCalendar";
import { WeekSubmit } from "./_components/WeekSubmit";
import { PenaltyNotice } from "./_components/PenaltyNotice";
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

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

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

  const [week, members, archivedWeeks, penalties] = await Promise.all([
    getOrCreateCurrentWeek(userId),
    prisma.user.findMany({
      where: { id: { not: userId } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    getArchivedWeeks(userId),
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
  ]);

  // The user's own fines: a running total, plus this week's broken out so
  // they're shown front-and-centre. A fine's "date" is the meeting it relates
  // to (for skips) or when it was recorded (late submissions / manual fines).
  const penaltyTotal = penalties.reduce((s, p) => s + p.amount, 0);
  const weekStartMs = week.startDate.getTime();
  const weekEndMs = week.endDate.getTime();
  const penaltyDate = (p: (typeof penalties)[number]) =>
    p.meeting?.scheduledAt ?? p.createdAt;
  const weekPenalties = penalties
    .filter((p) => {
      const d = penaltyDate(p).getTime();
      return d >= weekStartMs && d <= weekEndMs;
    })
    .map((p) => ({
      id: p.id,
      label: PENALTY_LABEL[p.type],
      amount: p.amount,
      note: p.note,
      dateLabel: formatDateTimeTz(penaltyDate(p)),
    }));
  const weekPenaltyTotal = weekPenalties.reduce((s, p) => s + p.amount, 0);

  const overall = weekPercent(week.goals);
  const locked = week.goalsLocked;
  const submittedAtLabel = week.submittedAt
    ? formatDateTimeTz(week.submittedAt)
    : null;

  const incompleteGoals = week.goals
    .filter((g) => !isGoalComplete(g))
    .map((g) => ({ id: g.id, title: g.title, percent: goalPercent(g) }));

  const now = new Date();
  const todayYmd = toYmd(now);
  const nowStamp = toStamp(now);

  // Default date range for the next week (editable in the Start-new-week dialog).
  const nextBounds = nextWeekBounds(week.endDate);
  const defaultWeekStart = toLocalYmd(nextBounds.start);
  const defaultWeekEnd = toLocalYmd(nextBounds.end);

  // Open goals due on each day, keyed by "YYYY-MM-DD", as a list of their
  // priorities (null = no flag) so the calendar can color each dot.
  const deadlineDots: Record<string, (Priority | null)[]> = {};
  for (const g of week.goals) {
    if (g.deadline && !isGoalComplete(g)) {
      const key = toYmd(g.deadline);
      (deadlineDots[key] ??= []).push(g.priority ?? null);
    }
  }

  // Flatten to a serializable shape for the client components.
  const goals = week.goals.map((goal) => ({
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

  const team = members.map((m) => ({ id: m.id, name: displayName(m) }));

  const archive = archivedWeeks.map((w) => ({
    id: w.id,
    label: formatRange(w.startDate, w.endDate),
    percent: weekPercent(w.goals),
    goals: w.goals.map((g) => ({
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-8">
          <WeekArchive weeks={archive} />
        </div>
      </aside>

      <main className="flex w-full min-w-0 max-w-3xl flex-1 flex-col">
        <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            {formatRange(week.startDate, week.endDate)}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <WeekProgress percent={overall} />
          <ProfileMenu
            name={session!.user.name}
            email={session!.user.email}
            avatar={avatar}
            takenAvatars={takenAvatars}
            isAdmin={isAdmin(session!.user.email)}
          />
        </div>
      </header>

      {penaltyTotal > 0 && (
        <PenaltyNotice
          weekPenalties={weekPenalties}
          weekTotal={weekPenaltyTotal}
          allTimeTotal={penaltyTotal}
        />
      )}

      <WeekSubmit
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

        {!locked && <AddGoalCard nextIndex={goals.length + 1} todayYmd={todayYmd} />}

        {goals.length === 0 && (
          <p className="px-1 text-sm text-muted-fg">
            Add your goals for the week, then break each one into subtasks.
          </p>
        )}
      </section>

        <footer className="mt-10 border-t border-line pt-6">
          <StartNewWeekButton
            incompleteGoals={incompleteGoals}
            defaultStart={defaultWeekStart}
            defaultEnd={defaultWeekEnd}
            todayYmd={todayYmd}
          />
        </footer>
      </main>

      <aside className="hidden w-64 shrink-0 xl:block">
        <div className="sticky top-8">
          <WeekCalendar deadlines={deadlineDots} />
        </div>
      </aside>

      <FeedbackButton />
    </div>
  );
}
