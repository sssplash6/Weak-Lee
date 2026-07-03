import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { goalPercent, isGoalComplete, weekPercent } from "@/lib/progress";
import { getWeekBounds } from "@/lib/weeks";
import { formatDateTimeTz, formatStamp, formatYmd, toStamp, toYmd } from "@/lib/dates";
import { resolveAvatar } from "@/lib/avatar";
import { BackLink } from "@/app/_components/BackLink";
import { ReviewCards, type ReviewMember } from "./_components/ReviewCards";

export default async function AdminReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (!isAdmin(session.user.email)) redirect("/dashboard");

  const rawUsers = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      weeks: {
        where: { isCurrent: true },
        select: {
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
              subtasks: { select: { isDone: true } },
            },
          },
        },
      },
    },
  });

  const members: ReviewMember[] = rawUsers.map((u) => {
    const week = u.weeks[0];
    const goals = week?.goals ?? [];
    const avatar = resolveAvatar(u.avatar, u.email ?? u.id);
    return {
      id: u.id,
      name: u.name ?? u.email ?? "—",
      emoji: avatar.emoji,
      bg: avatar.bg,
      goalCount: goals.length,
      percent: weekPercent(goals),
      late: week?.submittedLate ?? false,
      submittedAtLabel: week?.submittedAt
        ? formatDateTimeTz(week.submittedAt)
        : null,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        percent: goalPercent(g),
        completed: isGoalComplete(g),
        deadlineLabel: g.deadline ? formatStamp(toStamp(g.deadline)) : null,
      })),
    };
  });

  const bounds = getWeekBounds(new Date());
  const weekRange = `${formatYmd(toYmd(bounds.start))} – ${formatYmd(toYmd(bounds.end))}`;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy · Admin
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Week in review</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {weekRange} · tap a person to see their goals.
          </p>
        </div>
        <BackLink href="/admin" label="Admin" />
      </header>

      <ReviewCards members={members} />
    </div>
  );
}
