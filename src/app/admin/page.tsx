import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { goalPercent, isGoalComplete, weekPercent } from "@/lib/progress";
import { AdminUserList, type AdminUser } from "./_components/AdminUserList";

function fmtRange(start: Date, end: Date): string {
  const f = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}

export default async function AdminPage() {
  const session = await auth();
  // Gate: must be signed in AND an admin. Everyone else goes to the dashboard.
  if (!session?.user?.id) redirect("/signin");
  if (!isAdmin(session.user.email)) redirect("/dashboard");

  const [rawUsers, feedback] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        createdAt: true,
        weeks: {
          where: { isCurrent: true },
          select: {
            startDate: true,
            endDate: true,
            goals: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                title: true,
                completedAt: true,
                deadline: true,
                subtasks: { select: { isDone: true } },
              },
            },
          },
        },
      },
    }),
    prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, message: true, userEmail: true, createdAt: true },
    }),
  ]);

  const users: AdminUser[] = rawUsers.map((u) => {
    const week = u.weeks[0];
    const goals = week?.goals ?? [];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department,
      weekLabel: week ? fmtRange(week.startDate, week.endDate) : null,
      percent: weekPercent(goals),
      goalCount: goals.length,
      completedCount: goals.filter(isGoalComplete).length,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        percent: goalPercent(g.subtasks),
        completed: isGoalComplete(g),
        hasDeadline: g.deadline != null,
      })),
    };
  });

  // Aggregate stats. "Active" = has at least one goal in the current week.
  const active = users.filter((u) => u.goalCount > 0);
  const totalGoals = users.reduce((s, u) => s + u.goalCount, 0);
  const totalCompleted = users.reduce((s, u) => s + u.completedCount, 0);
  const avgCompletion = active.length
    ? Math.round(active.reduce((s, u) => s + u.percent, 0) / active.length)
    : 0;

  const stats = [
    { label: "Users", value: users.length },
    { label: "Active this week", value: active.length },
    { label: "Goals set", value: totalGoals },
    { label: "Goals completed", value: totalCompleted },
    { label: "Avg completion", value: `${avgCompletion}%` },
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
            Weekly goals and progress across everyone.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="shrink-0 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
        >
          ← My dashboard
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
        <h2 className="mb-3 px-1 text-sm font-semibold text-ink">
          People ({users.length})
        </h2>
        <AdminUserList users={users} />
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
