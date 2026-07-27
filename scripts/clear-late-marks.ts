/**
 * Clear the "Late" mark from weeks that no longer carry a late-submission fine.
 *
 * Why: `Week.submittedLate` is a separate record from the fine ledger, so
 * deleting a fine (forgiving it, or clearing one issued in error) used to leave
 * the Late badge and the admin "Late submissions" log behind for ever. The
 * Performance tab now reads lateness from the fines themselves; this brings the
 * flags in line so every surface tells the same story. Weeks from before the
 * deadline rule existed were never fined, so their flags clear too.
 *
 * Nothing else is touched: `submittedAt` — when the goals actually went in —
 * is left exactly as recorded.
 *
 * Usage (dry run — prints what it WOULD clear, changes nothing):
 *   DATABASE_URL="<prod-url>" npx tsx scripts/clear-late-marks.ts someone@freshman.academy
 *
 * Apply for real:
 *   DATABASE_URL="<prod-url>" npx tsx scripts/clear-late-marks.ts someone@freshman.academy --apply
 *
 * Every account at once (same dry-run default):
 *   DATABASE_URL="<prod-url>" npx tsx scripts/clear-late-marks.ts --all [--apply]
 */
import { prisma } from "@/lib/prisma";
import { weekSubmissionDeadline } from "@/lib/lateness";

const WEEK_MS = 7 * 86_400_000;

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const all = args.includes("--all");
  const email = args.find((a) => !a.startsWith("--"));

  if (!all && !email) {
    console.error(
      "usage: npx tsx scripts/clear-late-marks.ts <email> [--apply]\n" +
        "       npx tsx scripts/clear-late-marks.ts --all [--apply]",
    );
    process.exitCode = 2;
    return;
  }

  const users = await prisma.user.findMany({
    where: all ? {} : { email: { equals: email!, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      weeks: {
        where: { submittedLate: true },
        orderBy: { startDate: "asc" },
        select: { id: true, startDate: true, endDate: true },
      },
      penalties: {
        where: { type: "LATE_SUBMISSION" },
        select: { id: true, weekId: true, createdAt: true, amount: true },
      },
    },
  });

  if (users.length === 0) {
    console.log(`No user matches ${email}.`);
    return;
  }

  let cleared = 0;
  for (const u of users) {
    if (u.weeks.length === 0) continue;
    console.log(`\n${u.email ?? u.id}`);

    for (const w of u.weeks) {
      // The fine for a week is the one linked to it, or — for fines raised when
      // the person had no week row yet — one filed in that week's cycle.
      const from = weekSubmissionDeadline(w.startDate).getTime();
      const fine = u.penalties.find((p) =>
        p.weekId != null
          ? p.weekId === w.id
          : p.createdAt.getTime() >= from && p.createdAt.getTime() < from + WEEK_MS,
      );
      const label = `  ${fmt(w.startDate)} – ${fmt(w.endDate)}`;
      if (fine) {
        console.log(`${label}  keeps its Late mark ($${fine.amount} fine stands)`);
        continue;
      }
      cleared++;
      if (apply) {
        await prisma.week.update({
          where: { id: w.id },
          data: { submittedLate: false },
        });
        console.log(`${label}  cleared`);
      } else {
        console.log(`${label}  would clear (no late-submission fine)`);
      }
    }
  }

  console.log(
    `\n${apply ? "Cleared" : "Would clear"} ${cleared} week${cleared === 1 ? "" : "s"}.` +
      (apply ? "" : " Re-run with --apply to write."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
