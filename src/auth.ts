import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Dev-only login: a one-click "Continue as test student" that bypasses Google.
// Enabled only when ALLOW_DEV_LOGIN=true (never set this in production).
export const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true";

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
});
