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

/**
 * Return the user's current week, loaded with goals and subtasks (ordered).
 * Creates an empty week for the current calendar week if none is marked current.
 */
export async function getOrCreateCurrentWeek(userId: string) {
  const existing = await prisma.week.findFirst({
    where: { userId, isCurrent: true },
    include: weekInclude,
  });

  if (existing) return existing;

  const { start, end } = getWeekBounds();
  return prisma.week.create({
    data: { userId, startDate: start, endDate: end, isCurrent: true },
    include: weekInclude,
  });
}

export type CurrentWeek = Awaited<ReturnType<typeof getOrCreateCurrentWeek>>;
export type WeekGoal = CurrentWeek["goals"][number];
export type GoalSubtask = WeekGoal["subtasks"][number];
