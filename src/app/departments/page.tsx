import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Departments" };
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { resolveAvatar } from "@/lib/avatar";
import { BackLink } from "@/app/_components/BackLink";
import { DepartmentManager, type Person } from "./_components/DepartmentManager";

export default async function DepartmentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);
  if (!isAdmin(session.user.email)) redirect("/dashboard");

  const [departments, users] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        memberships: {
          // Leads first (enum order), then alphabetically.
          orderBy: [
            { role: "asc" },
            { user: { name: "asc" } },
            { user: { email: "asc" } },
          ],
          select: {
            role: true,
            user: {
              select: { id: true, name: true, email: true, avatar: true },
            },
          },
        },
      },
    }),
    // Everyone, for the add-person selects — and to find who holds no seat at
    // all (mid-onboarding, or their departments were deleted).
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        memberships: { select: { departmentId: true } },
      },
    }),
  ]);

  const toPerson = (
    u: { id: string; name: string | null; email: string | null; avatar: string | null },
    lead: boolean,
  ): Person => {
    const av = resolveAvatar(u.avatar, u.email ?? u.id);
    return {
      id: u.id,
      name: u.name ?? u.email ?? "—",
      email: u.email,
      emoji: av.emoji,
      bg: av.bg,
      lead,
    };
  };

  const deptViews = departments.map((d) => ({
    id: d.id,
    name: d.name,
    people: d.memberships.map((m) => toPerson(m.user, m.role === "LEAD")),
  }));

  const unassigned = users
    .filter((u) => u.memberships.length === 0)
    .map((u) => toPerson(u, false));

  const allPeople = users.map((u) => ({
    id: u.id,
    name: u.name ?? u.email ?? "—",
  }));

  const leadCount = departments.reduce(
    (s, d) => s + d.memberships.filter((m) => m.role === "LEAD").length,
    0,
  );
  const seatCount = departments.reduce((s, d) => s + d.memberships.length, 0);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            Admin
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Departments</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {`${departments.length} departments · ${leadCount} lead seats · ${seatCount} seats across ${users.length} people. `}
            One person can sit in several departments — lead of one, member of
            another — and each seat carries its own role. Leads owe Monday
            meetings and weekly/monthly submissions; members owe neither. New
            joiners pick their first department at onboarding and can join more
            from their profile.
          </p>
        </div>
        <BackLink href="/admin" label="Team overview" />
      </header>

      <DepartmentManager
        departments={deptViews}
        unassigned={unassigned}
        allPeople={allPeople}
        currentUserId={session.user.id}
      />
    </div>
  );
}
