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
// auth. Enabled only when ALLOW_DEV_LOGIN=true. Anyone with the URL can sign in
// as a shared account, so only enable it for throwaway demos — never for a real
// deployment with user data.
export const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true";

if (devLoginEnabled && process.env.NODE_ENV === "production") {
  console.warn(
    "[auth] ALLOW_DEV_LOGIN is enabled in production — this is an auth bypass. " +
      "Disable it once real sign-in is configured.",
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
            where: { role: "LEAD" },
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
