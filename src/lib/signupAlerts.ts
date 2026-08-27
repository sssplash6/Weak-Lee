// Server-only: telling the people who can let a sign-up in that one is waiting.
//
// A non-company sign-up sits on /pending doing nothing until a department lead
// or an admin approves it, so the request is only ever as good as the alert.
// This is the single place that decides who hears about it and what they're
// told to do, because the two audiences act in different places: a lead
// approves on /department, an admin approves *or* removes on /admin. Naming
// the wrong one is not a wording nit — /department redirects anyone who leads
// no department straight back to /dashboard, so an admin-only reviewer sent
// there lands nowhere near the queue.
//
// Every write goes through `announceSignup`, which skips reviewers who have
// already been told about that person. That makes it safe to call for a
// brand-new account (the sign-in event) and safe to re-run over the whole
// waiting queue (scripts/announce-pending-signups.ts) without spamming anyone.

import { prisma } from "@/lib/prisma";
import { adminEmails } from "@/lib/admin";
import { notify } from "@/lib/notifications";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** Opening words of every sign-up alert — also how we spot one we've sent. */
const SIGNUP_PREFIX = "New sign-up:";

export type PendingSignupUser = {
  id: string;
  name: string | null;
  email: string | null;
};

/** Who may review a sign-up, split by the page each one would act on. */
export type SignupReviewers = {
  /** Admins — /admin, where they can approve or remove. */
  adminIds: string[];
  /** Department leads who aren't admins — /department, approve only. */
  leadIds: string[];
};

/**
 * Everyone allowed to review a sign-up, matching `requireReviewer` in
 * app/department/actions.ts. A MINI department's lead seat is excluded there
 * (it's self-appointed, so it confers no power to admit strangers), which
 * makes paging those heads pure noise. Someone who is both an admin and a lead
 * counts as an admin: /admin carries both buttons.
 */
export async function signupReviewers(db: Db): Promise<SignupReviewers> {
  const [leads, admins] = await Promise.all([
    db.departmentMembership.findMany({
      where: { role: "LEAD", department: { mini: false } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.user.findMany({
      where: { email: { in: adminEmails(), mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  const adminIds = [...new Set(admins.map((a) => a.id))];
  const leadIds = [...new Set(leads.map((l) => l.userId))].filter(
    (id) => !adminIds.includes(id),
  );
  return { adminIds, leadIds };
}

/**
 * How a pending account is named in the alert: "Ada Lovelace (ada@gmail.com)".
 * The bracketed email is always there when we have one — it's what `marker`
 * matches on, and dropping it for a nameless account would break the
 * already-told check for exactly the people hardest to recognise without it.
 */
function describe(user: PendingSignupUser): string {
  const label = user.name ?? "Someone";
  return user.email ? `${label} (${user.email})` : label;
}

/**
 * The stable fragment every alert about `user` contains, so a re-run can tell
 * "already told them about this person" from "told them about someone else".
 * The brackets keep one address from matching another that ends with it.
 * Falls back to the display name when there's no email to key on.
 */
function marker(user: PendingSignupUser): string {
  return user.email ? `(${user.email})` : describe(user);
}

/**
 * Split `groups` into the reviewers who have NOT already been told that `user`
 * is waiting, keeping each group separate. Anyone who has heard is dropped,
 * read or not — a second copy of the same line is noise, not a reminder.
 *
 * One query covers every group: this runs once per waiting sign-up, so a spare
 * round trip per person adds up over a queue.
 */
async function untold(
  db: Db,
  user: PendingSignupUser,
  groups: string[][],
): Promise<string[][]> {
  const ids = [...new Set(groups.flat())];
  if (ids.length === 0) return groups.map(() => []);
  const already = await db.notification.findMany({
    where: {
      userId: { in: ids },
      AND: [
        { message: { startsWith: SIGNUP_PREFIX } },
        { message: { contains: marker(user) } },
      ],
    },
    select: { userId: true },
  });
  const told = new Set(already.map((n) => n.userId));
  return groups.map((g) => g.filter((id) => !told.has(id)));
}

/**
 * Tell every reviewer who hasn't heard yet that `user` is waiting for
 * approval. Returns who was (or, when `dryRun`, would be) written to.
 *
 * Pass `reviewers` to reuse one lookup across a whole queue.
 */
export async function announceSignup(
  db: Db,
  user: PendingSignupUser,
  opts: { reviewers?: SignupReviewers; dryRun?: boolean } = {},
): Promise<SignupReviewers> {
  const all = opts.reviewers ?? (await signupReviewers(db));
  // A reviewer never needs paging about their own sign-up.
  const notSelf = (id: string) => id !== user.id;
  const [adminIds, leadIds] = await untold(db, user, [
    all.adminIds.filter(notSelf),
    all.leadIds.filter(notSelf),
  ]);

  if (!opts.dryRun) {
    const who = describe(user);
    await notify(
      db,
      adminIds,
      "OTHER",
      `${SIGNUP_PREFIX} ${who} is waiting for approval — approve or remove them on the admin panel (/admin).`,
    );
    await notify(
      db,
      leadIds,
      "OTHER",
      `${SIGNUP_PREFIX} ${who} is waiting for approval — approve them on your department page (/department).`,
    );
  }

  return { adminIds, leadIds };
}

/** One entry per still-waiting sign-up: who they are, who still needs telling. */
export type PendingAnnouncement = {
  user: PendingSignupUser;
  createdAt: Date;
  reviewers: SignupReviewers;
};

/**
 * Walk the whole waiting queue, oldest request first, and announce each one to
 * the reviewers who were never told. Catches up sign-ups that arrived before
 * this alert existed, and any whose alert was lost to a hiccup at sign-in time
 * (the event writes it best-effort, so a failure there is silent).
 */
export async function announcePendingSignups(
  db: Db,
  opts: { dryRun?: boolean } = {},
): Promise<PendingAnnouncement[]> {
  const [waiting, reviewers] = await Promise.all([
    db.user.findMany({
      where: { approvedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    signupReviewers(db),
  ]);

  const out: PendingAnnouncement[] = [];
  for (const { createdAt, ...user } of waiting) {
    out.push({
      user,
      createdAt,
      reviewers: await announceSignup(db, user, {
        reviewers,
        dryRun: opts.dryRun,
      }),
    });
  }
  return out;
}
