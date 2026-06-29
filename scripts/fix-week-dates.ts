/**
 * One-off recovery: re-date a single user's *current* week to the current
 * calendar week, without touching their goals or subtasks.
 *
 * Why: during launch the app seeded each new user's first week one week ahead
 * (LAUNCH_START_NEXT_WEEK). People entered goals on that week thinking it was
 * "this week". This shifts the week's start/end back to the real current week;
 * the goals/subtasks ride along because they belong to the same week row —
 * nothing is moved, copied, or deleted.
 *
 * Usage (dry run — prints what it WOULD do, changes nothing):
 *   DATABASE_URL="<prod-url>" npx tsx scripts/fix-week-dates.ts someone@freshman.academy
 *
 * Apply for real (only after the dry run looks right):
 *   DATABASE_URL="<prod-url>" npx tsx scripts/fix-week-dates.ts someone@freshman.academy --apply
 */
import { prisma } from "@/lib/prisma";
import { getWeekBounds } from "@/lib/weeks";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const email = process.argv[2];
  const apply = process.argv.includes("--apply");

  if (!email || email.startsWith("--")) {
    console.error(
      "Usage: tsx scripts/fix-week-dates.ts <email> [--apply]\n" +
        "Re-dates that user's current week to the current calendar week.",
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });
  if (!user) {
    console.error(`No user found with email ${email}.`);
    process.exit(1);
  }

  const week = await prisma.week.findFirst({
    where: { userId: user.id, isCurrent: true },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      _count: { select: { goals: true } },
    },
  });
  if (!week) {
    console.error(`${user.name ?? email} has no current week to re-date.`);
    process.exit(1);
  }

  const { start, end } = getWeekBounds(new Date());

  console.log(`User:          ${user.name ?? "—"} <${email}>`);
  console.log(`Week id:       ${week.id}`);
  console.log(`Goals on week: ${week._count.goals} (preserved, never touched)`);
  console.log(`Current dates: ${fmt(week.startDate)} -> ${fmt(week.endDate)}`);
  console.log(`New dates:     ${fmt(start)} -> ${fmt(end)}`);

  if (fmt(week.startDate) === fmt(start) && fmt(week.endDate) === fmt(end)) {
    console.log("\nAlready on the current week — nothing to do.");
    return;
  }

  if (!apply) {
    console.log("\nDRY RUN — no changes made. Re-run with --apply to update.");
    return;
  }

  await prisma.week.update({
    where: { id: week.id },
    data: { startDate: start, endDate: end },
  });
  console.log("\n✓ Done — week re-dated to the current calendar week.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
