import { prisma } from "@/lib/prisma";

/**
 * First day 00:00 UTC and last day 23:59:59.999 UTC of the calendar month
 * containing `date`. UTC for the same reason as getWeekBounds — a period
 * boundary must not move because the deployment's timezone did.
 */
export function getMonthBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0, // day 0 of the next month = last day of this month
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
}

/**
 * Bounds of the calendar month immediately following the one that ends at
 * `prevEnd`, so consecutive months stay sequential even when a month is closed
 * early or late.
 */
export function nextMonthBounds(prevEnd: Date): { start: Date; end: Date } {
  const next = new Date(prevEnd);
  next.setUTCDate(next.getUTCDate() + 1); // step into the following month
  return getMonthBounds(next);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Month bounds are UTC instants (see getMonthBounds above), so read them back
// with UTC getters — local ones would name the wrong month either side of
// midnight for any server that isn't on UTC.
export function monthLabel(start: Date): string {
  return `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
}

// Loads a month with its goals, subtasks, and delegation info. Same shape as
// the week include (see lib/weeks.ts) — inlined so Prisma infers the payload.
const monthInclude = {
  goals: {
    orderBy: { position: "asc" },
    include: {
      sharesOut: {
        include: { toUser: { select: { name: true, email: true } } },
      },
      shareIn: {
        include: { fromUser: { select: { name: true, email: true } } },
      },
      subtasks: {
        orderBy: { position: "asc" },
        include: {
          sharesOut: {
            include: { toUser: { select: { name: true, email: true } } },
          },
          shareIn: {
            include: { fromUser: { select: { name: true, email: true } } },
          },
        },
      },
    },
  },
} as const;

/**
 * Return the user's current month, loaded with goals and subtasks (ordered).
 * Creates an empty month for the current calendar month if none is marked
 * current.
 */
export async function getOrCreateCurrentMonth(userId: string) {
  // findFirst used to be enough, but nothing stops two concurrent loads from
  // both creating a current month, and it would then return whichever the
  // database happened to hand back first — a different one on different loads.
  // Pick deliberately (submitted, then fullest, then oldest — the same
  // tie-break weeks use) and retire the rest so the ambiguity doesn't persist.
  const current = await prisma.month.findMany({
    where: { userId, isCurrent: true },
    include: monthInclude,
  });

  if (current.length > 0) {
    const [keep, ...extra] = current.sort(
      (a, b) =>
        Number(b.submittedAt != null) - Number(a.submittedAt != null) ||
        b.goals.length - a.goals.length ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    if (extra.length > 0) {
      await prisma.month.updateMany({
        where: { id: { in: extra.map((m) => m.id) } },
        data: { isCurrent: false },
      });
    }
    return keep;
  }

  const { start, end } = getMonthBounds();
  return prisma.month.create({
    data: { userId, startDate: start, endDate: end, isCurrent: true },
    include: monthInclude,
  });
}

/**
 * Past months (already closed out), newest first, with goals and subtasks
 * loaded lean — just what the archive sidebar needs.
 */
export async function getArchivedMonths(userId: string) {
  return prisma.month.findMany({
    where: { userId, isCurrent: false },
    orderBy: { startDate: "desc" },
    include: {
      goals: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          incompleteReason: true,
          completedAt: true,
          manualPercent: true,
          subtasks: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, isDone: true },
          },
        },
      },
    },
  });
}

export type CurrentMonth = Awaited<ReturnType<typeof getOrCreateCurrentMonth>>;
