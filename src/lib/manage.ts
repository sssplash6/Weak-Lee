// Server-only: who may act ON whom. Assigning tasks, fining, and awarding
// bonuses used to be admin-only; department leads now hold the same three
// powers over the people under them. "Under" means holding a MEMBER seat in a
// department the actor holds a LEAD seat in — a fellow lead of the same
// department is a peer, not a report, and nobody manages themselves.

import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

type Actor = { id: string; email?: string | null };

/**
 * The user ids this actor may manage: "all" for admins, else the members
 * under the departments they lead (possibly empty).
 */
export async function manageableUserIds(
  actor: Actor,
): Promise<"all" | Set<string>> {
  if (isAdmin(actor.email)) return "all";

  const led = await prisma.departmentMembership.findMany({
    where: { userId: actor.id, role: "LEAD" },
    select: { departmentId: true },
  });
  if (led.length === 0) return new Set();

  const members = await prisma.departmentMembership.findMany({
    where: {
      departmentId: { in: led.map((l) => l.departmentId) },
      role: "MEMBER",
      userId: { not: actor.id },
    },
    select: { userId: true },
  });
  return new Set(members.map((m) => m.userId));
}

/**
 * Throw unless the signed-in actor may manage every one of `targetUserIds`.
 * Admins always pass; a lead passes for their own members only.
 */
export async function requireCanManage(
  session: { user?: { id?: string; email?: string | null } } | null,
  targetUserIds: string[],
): Promise<void> {
  const actorId = session?.user?.id;
  if (!actorId) throw new Error("Not authenticated");
  const scope = await manageableUserIds({
    id: actorId,
    email: session!.user!.email,
  });
  if (scope === "all") return;
  if (!targetUserIds.every((id) => scope.has(id))) {
    throw new Error("Not authorized");
  }
}
