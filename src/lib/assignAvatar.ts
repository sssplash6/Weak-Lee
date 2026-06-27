import { prisma } from "@/lib/prisma";
import { AVATAR_EMOJIS, hashSeed } from "@/lib/avatar";

/** True if a Prisma error is a unique-constraint violation (P2002). */
function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && e.code === "P2002";
}

/**
 * Ensure a user has a unique preset animal avatar, assigning a free one if not.
 * Returns the assigned emoji, or null when every animal is already taken.
 *
 * The DB enforces one-animal-one-user via a unique index; concurrent assignment
 * races surface as P2002 and we just try the next free animal.
 */
export async function ensureAvatar(
  userId: string,
  seed: string | null | undefined,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });
  if (!user) return null;
  if (user.avatar) return user.avatar;

  const taken = new Set(
    (
      await prisma.user.findMany({
        where: { avatar: { not: null } },
        select: { avatar: true },
      })
    ).map((u) => u.avatar as string),
  );

  // Try free animals, starting at a seed-derived offset so people don't all get
  // the first one — but still deterministic per user.
  const free = AVATAR_EMOJIS.filter((e) => !taken.has(e));
  if (free.length === 0) return null;
  const start = hashSeed(seed) % free.length;
  const ordered = [...free.slice(start), ...free.slice(0, start)];

  for (const emoji of ordered) {
    try {
      // Only assign if still unset (avoids clobbering a concurrent assignment).
      const res = await prisma.user.updateMany({
        where: { id: userId, avatar: null },
        data: { avatar: emoji },
      });
      if (res.count === 1) return emoji;
      // Someone assigned in the meantime — return whatever they got.
      const now = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatar: true },
      });
      if (now?.avatar) return now.avatar;
    } catch (e) {
      if (isUniqueViolation(e)) continue; // emoji grabbed by another user; next
      throw e;
    }
  }
  return null;
}
