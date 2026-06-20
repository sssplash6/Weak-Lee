import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe Auth.js config (no database adapter). Shared between the middleware
// (edge runtime) and the full server config in `src/auth.ts`.
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    // Route protection. Runs in middleware for every matched request.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnSignin = nextUrl.pathname.startsWith("/signin");

      if (isOnDashboard) {
        return isLoggedIn; // redirected to signIn page when false
      }
      if (isOnSignin && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    // Persist the user id on the JWT so it's available without a DB read.
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    // Expose the user id on the session for server actions / components.
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
