import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Departments" };
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { resolveAvatar } from "@/lib/avatar";
import { BackLink } from "@/app/_components/BackLink";
import { DepartmentManager, type Person } from "./_components/DepartmentManager";

export default async function DepartmentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (!isAdmin(session.user.email)) redirect("/dashboard");

  const [departments, unassigned] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        members: {
          // Leads first (enum order), then alphabetically.
          orderBy: [{ role: "asc" }, { name: "asc" }, { email: "asc" }],
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
      },
    }),
    // People with no department: mid-onboarding, or their department was
    // deleted. Surfaced here so nobody silently falls out of the structure.
    prisma.user.findMany({
      where: { departmentId: null },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, avatar: true, role: true },
    }),
  ]);

  const toPerson = (u: (typeof unassigned)[number]): Person => {
    const av = resolveAvatar(u.avatar, u.email ?? u.id);
    return {
      id: u.id,
      name: u.name ?? u.email ?? "—",
      email: u.email,
      emoji: av.emoji,
      bg: av.bg,
      lead: u.role === "LEAD",
    };
  };

  const deptViews = departments.map((d) => ({
    id: d.id,
    name: d.name,
    people: d.members.map(toPerson),
  }));

  const leadCount = departments.reduce(
    (s, d) => s + d.members.filter((m) => m.role === "LEAD").length,
    0,
  );
  const peopleCount =
    departments.reduce((s, d) => s + d.members.length, 0) + unassigned.length;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            Admin
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Departments</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {`${departments.length} departments · ${leadCount} leads · ${peopleCount} people. `}
            Leads are expected at Monday meetings and to submit weekly and
            monthly goals; members aren&rsquo;t. New joiners pick a department
            from this list during onboarding.
          </p>
        </div>
        <BackLink href="/admin" label="Team overview" />
      </header>

      <DepartmentManager
        departments={deptViews}
        unassigned={unassigned.map(toPerson)}
        currentUserId={session.user.id}
      />
    </div>
  );
}
