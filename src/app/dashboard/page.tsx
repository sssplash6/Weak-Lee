import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getArchivedWeeks, getOrCreateCurrentWeek } from "@/lib/weeks";
import { goalPercent, weekPercent } from "@/lib/progress";
import { GoalCard } from "./_components/GoalCard";
import { AddGoalCard } from "./_components/AddGoalCard";
import { ProfileMenu } from "./_components/ProfileMenu";
import { WeekProgress } from "./_components/WeekProgress";
import { StartNewWeekButton } from "./_components/StartNewWeekButton";
import { WeekArchive } from "./_components/WeekArchive";

function formatRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function displayName(u: { name: string | null; email: string | null }): string {
  return u.name ?? u.email ?? "Someone";
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [week, members, archivedWeeks] = await Promise.all([
    getOrCreateCurrentWeek(userId),
    prisma.user.findMany({
      where: { id: { not: userId } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    getArchivedWeeks(userId),
  ]);

  const overall = weekPercent(week.goals);

  const incompleteGoals = week.goals
    .map((g) => ({ id: g.id, title: g.title, percent: goalPercent(g.subtasks) }))
    .filter((g) => g.percent < 100);

  // Flatten to a serializable shape for the client components.
  const goals = week.goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
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
      percent: goalPercent(g.subtasks),
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
            image={session!.user.image}
          />
        </div>
      </header>

      <section className="flex flex-col gap-4">
        {goals.map((goal, i) => (
          <GoalCard key={goal.id} goal={goal} index={i + 1} team={team} />
        ))}

        <AddGoalCard nextIndex={goals.length + 1} />

        {goals.length === 0 && (
          <p className="px-1 text-sm text-muted-fg">
            Add your goals for the week, then break each one into subtasks.
          </p>
        )}
      </section>

        <footer className="mt-10 border-t border-line pt-6">
          <StartNewWeekButton incompleteGoals={incompleteGoals} />
        </footer>
      </main>

      {/* Reserved for the right-side panel (coming next). */}
      <aside className="hidden w-64 shrink-0 xl:block" aria-hidden />
    </div>
  );
}
