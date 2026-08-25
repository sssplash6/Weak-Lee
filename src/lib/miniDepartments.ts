// Server-only: the self-governing half of a mini department (Department.mini).
//
// A mini department has no admin-appointed head. The first person to take a
// seat in one becomes its lead, so Alumni Council has a head from its first
// sign-up without anyone visiting /departments. This is safe precisely because
// leading a mini department costs nothing — no Monday meeting seat, no weekly
// deadline, no fines (see isExpectedLead in lib/team.ts) — so an automatic
// promotion can't saddle a new joiner with an obligation. Normal departments
// keep their admin-granted leads: a new joiner there is always a member.
//
// Only the self-service paths use this (onboarding, joining from the profile).
// Admins choose the role explicitly on /departments, so nothing overrides them.

import type { Prisma } from "@/generated/prisma/client";

/**
 * Promote this person to LEAD in every mini department among `departmentIds`
 * that has no lead yet, and say which ones they took. Expects their
 * memberships to exist already. Runs inside the caller's transaction so two
 * people joining an empty mini department at once can't both claim it.
 */
export async function claimVacantMiniLeads(
  tx: Prisma.TransactionClient,
  userId: string,
  departmentIds: string[],
): Promise<{ id: string; name: string }[]> {
  if (departmentIds.length === 0) return [];

  const mini = await tx.department.findMany({
    where: { id: { in: departmentIds }, mini: true },
    select: { id: true, name: true },
  });

  const claimed: { id: string; name: string }[] = [];
  for (const d of mini) {
    const leads = await tx.departmentMembership.count({
      where: { departmentId: d.id, role: "LEAD" },
    });
    if (leads > 0) continue; // already has a head — including this person
    await tx.departmentMembership.update({
      where: { userId_departmentId: { userId, departmentId: d.id } },
      data: { role: "LEAD" },
    });
    claimed.push(d);
  }
  return claimed;
}

/** The heads-up a mini department's first joiner gets on being made its lead. */
export function miniLeadNotice(name: string): string {
  return `You lead ${name} — a mini department takes its head from whoever joins it first. It carries no meeting or weekly-report duties.`;
}
