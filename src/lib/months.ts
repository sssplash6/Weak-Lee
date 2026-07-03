import { prisma } from "@/lib/prisma";

/** First day 00:00 and last day 23:59:59.999 of the calendar month containing `date`. */
export function getMonthBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0, // day 0 of the next month = last day of this month
    23,
    59,
    59,
    999,
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
  next.setDate(next.getDate() + 1); // step into the following month
  return getMonthBounds(next);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Month bounds are created with local server time (see getMonthBounds above),
// so read them back with local getters rather than UTC ones.
export function monthLabel(start: Date): string {
  return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
}

// Loads a month with its goals, subtasks, and delegation info. Same shape as
// the week include (see lib/weeks.ts) — inlined so Prisma infers the payload.
const monthInclude = {
  goals: {
    orderBy: { position: "asc" },
    include: {
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
  const existing = await prisma.month.findFirst({
    where: { userId, isCurrent: true },
    include: monthInclude,
  });

  if (existing) return existing;

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
