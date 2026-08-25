import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { ensureAvatar } from "@/lib/assignAvatar";
import { isCompanyEmail } from "@/lib/company";
import { adminEmails } from "@/lib/admin";
import { notify } from "@/lib/notifications";

// Dev-only login: a one-click "Continue as test student" that bypasses real
// auth. Anyone with the URL can sign in as a shared account, so it needs BOTH
// ALLOW_DEV_LOGIN=true and a non-production build. A production build never
// registers the provider whatever the environment says — a warning is not a
// control, and a stray dashboard variable must not be able to reopen an auth
// bypass on the live site.
const devLoginRequested = process.env.ALLOW_DEV_LOGIN === "true";
const inProduction = process.env.NODE_ENV === "production";

export const devLoginEnabled = devLoginRequested && !inProduction;

if (devLoginRequested && inProduction) {
  console.error(
    "[auth] ALLOW_DEV_LOGIN=true was IGNORED: the dev login bypass is disabled " +
      "in production builds. Unset the variable to silence this.",
  );
}

const devProviders = devLoginEnabled
  ? [
      Credentials({
        id: "dev",
        name: "Dev Login",
        credentials: {},
        async authorize() {
          // Upsert a real User row so foreign keys (Week.userId) resolve.
          const user = await prisma.user.upsert({
            where: { email: "dev@freshman.academy" },
            update: {},
            create: { email: "dev@freshman.academy", name: "Test Student" },
          });
          await ensureAvatar(user.id, user.email);
          return { id: user.id, name: user.name, email: user.email };
        },
      }),
    ]
  : [];

// Full server-side Auth.js instance: the Prisma adapter persists users and
// OAuth accounts, while sessions are stored as JWTs (edge-compatible proxy).
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [...authConfig.providers, ...devProviders],
  events: {
    // Runs once per brand-new (OAuth) user: hand out a unique animal avatar,
    // then settle their standing. Company accounts are approved on the spot;
    // anyone else waits on /pending, and every department lead and admin is
    // told there's a sign-up to review. Best-effort — a notification hiccup
    // must never break the sign-in itself.
    async createUser({ user }) {
      if (!user.id) return;
      await ensureAvatar(user.id, user.email ?? user.name);
      try {
        if (isCompanyEmail(user.email)) {
          await prisma.user.update({
            where: { id: user.id },
            data: { approvedAt: new Date() },
          });
          return;
        }
        const [leads, admins] = await Promise.all([
          prisma.departmentMembership.findMany({
            // Mini-department heads can't review sign-ups (see
            // requireReviewer in app/department/actions.ts), so paging them
            // would only be noise.
            where: { role: "LEAD", department: { mini: false } },
            select: { userId: true },
            distinct: ["userId"],
          }),
          prisma.user.findMany({
            where: { email: { in: adminEmails(), mode: "insensitive" } },
            select: { id: true },
          }),
        ]);
        const reviewers = [
          ...leads.map((l) => l.userId),
          ...admins.map((a) => a.id),
        ].filter((id) => id !== user.id);
        await notify(
          prisma,
          reviewers,
          "OTHER",
          `New sign-up: ${user.name ?? user.email} (${user.email}) is waiting for approval — review them on your department page.`,
        );
      } catch (e) {
        console.error("post-signup approval bookkeeping failed", e);
      }
    },
  },
});
