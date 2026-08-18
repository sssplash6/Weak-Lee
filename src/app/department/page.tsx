import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Your department" };
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveAvatar } from "@/lib/avatar";
import { weekPercent } from "@/lib/progress";
import { formatDateTimeTz } from "@/lib/dates";
import { BackLink } from "@/app/_components/BackLink";
import { LeadRoster, type LeadDepartment } from "./_components/LeadRoster";

/**
 * The department panel for leads: everyone holding a MEMBER seat in a
 * department the viewer leads, with the lead's three powers — assign a goal,
 * fine, bonus — right on each row. Admins have the wider /admin view; this is
 * the scoped, day-to-day one for a lead. (The actions themselves re-check the
 * same scope server-side, see lib/manage.ts.)
 */
export default async function DepartmentPanelPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const userId = session.user.id;

  const led = await prisma.departmentMembership.findMany({
    where: { userId, role: "LEAD" },
    orderBy: { department: { name: "asc" } },
    select: {
      department: {
        select: {
          id: true,
          name: true,
          memberships: {
            // The people under this department: member seats, not fellow leads.
            where: { role: "MEMBER", userId: { not: userId } },
            orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  weeks: {
                    where: { isCurrent: true },
                    select: {
                      submittedAt: true,
                      createdAt: true,
                      goals: {
                        select: {
                          completedAt: true,
                          manualPercent: true,
                          subtasks: { select: { isDone: true } },
                        },
                      },
                    },
                  },
                  penalties: {
                    where: { paidAt: null },
                    select: { amount: true, paidAmount: true },
                  },
                  assignedTasks: {
                    where: { completedAt: null },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Not a lead anywhere — this panel isn't theirs.
  if (led.length === 0) redirect("/dashboard");

  const departments: LeadDepartment[] = led.map(({ department: d }) => ({
    id: d.id,
    name: d.name,
    people: d.memberships.map(({ user: u }) => {
      const av = resolveAvatar(u.avatar, u.email ?? u.id);
      // A redeploy race can leave duplicate current weeks; prefer the
      // submitted one, then the fullest (same tie-break as getOrCreate).
      const week = [...u.weeks].sort(
        (a, b) =>
          Number(b.submittedAt != null) - Number(a.submittedAt != null) ||
          b.goals.length - a.goals.length ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      )[0];
      return {
        id: u.id,
        name: u.name ?? u.email ?? "—",
        emoji: av.emoji,
        bg: av.bg,
        goalCount: week?.goals.length ?? 0,
        weekPercent: week ? weekPercent(week.goals) : 0,
        submittedAtLabel: week?.submittedAt
          ? formatDateTimeTz(week.submittedAt)
          : null,
        outstanding: u.penalties.reduce(
          (s, p) => s + (p.amount - p.paidAmount),
          0,
        ),
        openTasks: u.assignedTasks.length,
      };
    }),
  }));

  const peopleCount = new Set(
    departments.flatMap((d) => d.people.map((p) => p.id)),
  ).size;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            Department lead
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            {departments.length === 1
              ? departments[0].name
              : "Your departments"}
          </h1>
          <p className="mt-1 text-sm text-muted-fg">
            {`${peopleCount} ${peopleCount === 1 ? "person" : "people"} under you. `}
            Assign goals, issue fines, and award bonuses — each lands on their
            dashboard with a notification, and everything shows in the admin
            ledgers too.
          </p>
        </div>
        <BackLink href="/dashboard" label="My dashboard" />
      </header>

      <LeadRoster departments={departments} />
    </div>
  );
}
