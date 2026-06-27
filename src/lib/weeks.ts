import { prisma } from "@/lib/prisma";

/** Monday 00:00 and the following Sunday 23:59:59 for the week containing `date`. */
export function getWeekBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date);
  const day = start.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7; // days since Monday
  start.setDate(start.getDate() - diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Bounds of the week immediately following the one that ends at `prevEnd`.
 * Used when starting a new week so consecutive weeks get distinct, sequential
 * date ranges instead of all reusing the current calendar week.
 */
export function nextWeekBounds(prevEnd: Date): { start: Date; end: Date } {
  const next = new Date(prevEnd);
  next.setDate(next.getDate() + 1); // step into the following week
  return getWeekBounds(next);
}

// Loads a week with its goals, subtasks, and delegation info. Inlined at both
// call sites so Prisma infers the full relation payload type.
const weekInclude = {
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

// Launch exception: seed each user's first auto-created week as the *upcoming*
// week rather than the current (nearly-over) calendar week, so people who sign
// up at launch land on a fresh full week. Set back to false (or delete) once the
// launch week has started.
const LAUNCH_START_NEXT_WEEK = true;

/**
 * Return the user's current week, loaded with goals and subtasks (ordered).
 * Creates an empty week for the current calendar week if none is marked current
 * (or the upcoming week while LAUNCH_START_NEXT_WEEK is on).
 */
export async function getOrCreateCurrentWeek(userId: string) {
  const existing = await prisma.week.findFirst({
    where: { userId, isCurrent: true },
    include: weekInclude,
  });

  if (existing) return existing;

  const { start, end } = LAUNCH_START_NEXT_WEEK
    ? nextWeekBounds(getWeekBounds().end)
    : getWeekBounds();
  return prisma.week.create({
    data: { userId, startDate: start, endDate: end, isCurrent: true },
    include: weekInclude,
  });
}

/**
 * Past weeks (already closed out), newest first, with goals and subtasks loaded
 * lean — just what the archive sidebar needs to show completion rates.
 */
export async function getArchivedWeeks(userId: string) {
  return prisma.week.findMany({
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
          subtasks: {
            orderBy: { position: "asc" },
            select: { id: true, title: true, isDone: true },
          },
        },
      },
    },
  });
}

export type CurrentWeek = Awaited<ReturnType<typeof getOrCreateCurrentWeek>>;
export type WeekGoal = CurrentWeek["goals"][number];
export type GoalSubtask = WeekGoal["subtasks"][number];
