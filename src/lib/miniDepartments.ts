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
 * Namespace for the per-department claim lock, so it can't collide with any
 * other advisory lock the app takes (see PAYROLL_LOCK_NAMESPACE). Arbitrary
 * but fixed.
 */
const MINI_LEAD_LOCK_NAMESPACE = 5_207_884;

/**
 * Promote this person to LEAD in every mini department among `departmentIds`
 * that has no lead yet, and say which ones they took. Expects their
 * memberships to exist already, and must run inside a transaction.
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
    // Serialize the claim on this department. A transaction alone does NOT do
    // it: at READ COMMITTED two joiners insert different membership rows, so
    // nothing locks them against each other, both count zero leads, and both
    // promote themselves — a mini department with two heads (reproduced before
    // this lock existed). Postgres holds the lock for the life of the
    // transaction and drops it on commit or rollback.
    // Projected through a subquery because pg_advisory_xact_lock returns
    // `void`, which Prisma's raw-query decoder can't deserialize — it throws
    // before the lock is any use. The outer SELECT hands it an int instead.
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${MINI_LEAD_LOCK_NAMESPACE}::int4, hashtext(${d.id}))) AS _lock`;

    // Re-read behind the lock: whoever held it first may have just taken the
    // seat this call was about to claim.
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
