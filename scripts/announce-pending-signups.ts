/**
 * Notify every reviewer about the sign-ups already waiting for approval.
 *
 * Why: the "someone is waiting for approval" alert is written once, from the
 * Auth.js `createUser` event, and best-effort — the sign-in must not fail over
 * a notification. So anyone who signed up before that alert existed, or whose
 * alert was lost to a hiccup, sits on /pending silently and nobody is paged.
 * This replays the alert over the whole waiting queue.
 *
 * Safe to run repeatedly: a reviewer already told about a given person is
 * skipped, read or not, so nobody gets the same line twice. Only notifications
 * are written — no account is approved, removed, or touched in any way.
 *
 * Usage (dry run — prints what it WOULD send, changes nothing):
 *   DATABASE_URL="<prod-url>" npx tsx scripts/announce-pending-signups.ts
 *
 * Send for real (only after the dry run looks right):
 *   DATABASE_URL="<prod-url>" npx tsx scripts/announce-pending-signups.ts --apply
 */
import { prisma } from "@/lib/prisma";
import { announcePendingSignups, reviewerDirectory } from "@/lib/signupAlerts";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

async function main() {
  const apply = process.argv.slice(2).includes("--apply");

  const dir = await reviewerDirectory(prisma);
  const reviewerCount = dir.adminIds.length + dir.allLeadIds.length;
  if (reviewerCount === 0) {
    console.error(
      "No reviewers found — no admin has ever signed in and no non-mini\n" +
        "department has a lead. Nobody can be notified (or approve anyone).",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Reviewers: ${dir.adminIds.length} admin(s) → /admin, ` +
      `${dir.allLeadIds.length} lead(s) → /department`,
  );
  // Who each sign-up actually reaches is narrower: the lead of the department
  // they named, plus tech@. Only a sign-up that named none pages everyone.
  console.log(
    `Alerts are scoped by the department each sign-up named on /pending; ` +
      `one that named none reaches all ${reviewerCount}.`,
  );

  const results = await announcePendingSignups(prisma, { dryRun: !apply });
  if (results.length === 0) {
    console.log("\nNothing waiting for approval — queue is empty.");
    return;
  }

  console.log(`\n${results.length} sign-up(s) waiting:\n`);
  let written = 0;
  for (const { user, createdAt, reviewers: to } of results) {
    const n = to.adminIds.length + to.leadIds.length;
    written += n;
    const dept = user.requestedDepartmentName ?? "no department named";
    const who = `${user.name ?? "—"} <${user.email ?? "no email"}> · ${dept}`;
    console.log(
      `  ${fmt(createdAt)}  ${who}\n` +
        `      ${n === 0 ? "every reviewer already notified" : `${apply ? "notified" : "would notify"} ${n} reviewer(s) (${to.adminIds.length} admin, ${to.leadIds.length} lead)`}`,
    );
  }

  console.log(
    `\n${written} notification(s) ${apply ? "written" : "would be written"}.`,
  );
  if (!apply && written > 0) console.log("Re-run with --apply to send them.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
