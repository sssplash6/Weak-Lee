/**
 * Rebuild colleague reports filed before there was a table to file them in.
 *
 * Why: "Report a colleague" used to only fire a REPORT notification at each
 * admin — no row anywhere. Those notifications drop out of the dashboard's
 * 48-hour updates window and vanish once read, so /penalties/reports opens
 * empty on a database that has been taking reports for months. The text of the
 * notification is the only surviving copy, and it is enough:
 *
 *   "<reporter> reported <name>, <name> — “<reason>”"
 *
 * What it does: parses those messages, resolves the names back to accounts,
 * and writes one ColleagueReport per report (not per admin who was pinged —
 * the same message went to all of them, so it dedupes on message + timestamp).
 * Rows land as OPEN with their ORIGINAL createdAt, so the list reads in the
 * order things actually happened.
 *
 * Names that no longer match an account — the reporter's or a subject's — are
 * kept verbatim (`legacyReporter` / `legacySubjects`) rather than dropped: a
 * report that can't say who filed it or who it was about is no record at all.
 *
 * Safe to re-run: a report is skipped when one already exists with the same
 * reason at the same instant.
 *
 * Usage (dry run — prints what it WOULD create, changes nothing):
 *   DATABASE_URL="<url>" npx tsx scripts/backfill-colleague-reports.ts
 *
 * Apply for real:
 *   DATABASE_URL="<url>" npx tsx scripts/backfill-colleague-reports.ts --apply
 */
import { prisma } from "@/lib/prisma";

// "<reporter> reported <names> — “<reason>”" — the exact shape reportColleagues
// wrote. The em dash and curly quotes are what pins it: a daily-report reminder
// also carries type REPORT, and neither it nor any other notification matches.
const SHAPE = /^(.+?) reported (.+?) — “([\s\S]+)”$/;

const apply = process.argv.includes("--apply");

type Person = { id: string; name: string | null; email: string | null };

/** Match a display name (or email) back to the account it came from. */
function resolve(people: Person[], label: string): Person | null {
  const want = label.trim().toLowerCase();
  if (!want || want === "—") return null;
  return (
    people.find((p) => (p.name ?? "").trim().toLowerCase() === want) ??
    people.find((p) => (p.email ?? "").trim().toLowerCase() === want) ??
    null
  );
}

async function main() {
  const people = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  const notifications = await prisma.notification.findMany({
    where: { message: { contains: " reported " } },
    orderBy: { createdAt: "asc" },
    select: { message: true, createdAt: true },
  });

  // One report was announced to every admin, so the same (message, instant)
  // repeats. Collapse to the distinct reports.
  const seen = new Set<string>();
  const distinct: { message: string; createdAt: Date }[] = [];
  for (const n of notifications) {
    const key = `${n.createdAt.toISOString()}|${n.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(n);
  }

  let created = 0;
  let skipped = 0;
  let unparsed = 0;
  const unmatched = new Set<string>();

  for (const n of distinct) {
    const m = SHAPE.exec(n.message);
    if (!m) {
      unparsed++;
      continue;
    }
    const [, reporterLabel, namesLabel, reason] = m;

    const already = await prisma.colleagueReport.findFirst({
      where: { reason, createdAt: n.createdAt },
      select: { id: true },
    });
    if (already) {
      skipped++;
      continue;
    }

    const reporter = resolve(people, reporterLabel);
    if (!reporter) unmatched.add(reporterLabel.trim());

    const labels = namesLabel.split(",").map((s) => s.trim()).filter(Boolean);
    const subjects: string[] = [];
    const lost: string[] = [];
    for (const label of labels) {
      const hit = resolve(people, label);
      if (hit) subjects.push(hit.id);
      else {
        lost.push(label);
        unmatched.add(label);
      }
    }

    console.log(
      `${apply ? "create" : "would create"}  ${n.createdAt.toISOString().slice(0, 16)}  ` +
        `${reporterLabel} → ${labels.join(", ")}` +
        `${lost.length ? `  [unmatched: ${lost.join(", ")}]` : ""}`,
    );
    console.log(`            “${reason.slice(0, 120)}”`);

    if (apply) {
      await prisma.colleagueReport.create({
        data: {
          reporterId: reporter?.id ?? null,
          reason,
          createdAt: n.createdAt,
          legacyReporter: reporter ? null : reporterLabel.trim(),
          legacySubjects: lost.length ? lost.join(", ") : null,
          subjects: { create: subjects.map((userId) => ({ userId })) },
        },
      });
    }
    created++;
  }

  console.log(
    `\n${apply ? "Created" : "Would create"} ${created} · already present ${skipped}` +
      `${unparsed ? ` · ignored ${unparsed} non-report message(s)` : ""}`,
  );
  if (unmatched.size > 0) {
    console.log(
      `Names with no matching account (kept as text): ${[...unmatched].join(", ")}`,
    );
  }
  if (!apply && created > 0) {
    console.log("\nDry run — nothing was written. Re-run with --apply.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
