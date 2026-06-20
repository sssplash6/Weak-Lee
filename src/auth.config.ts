import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Show Google sign-in only when its credentials are configured, so a demo that
// relies on dev login doesn't surface a broken button.
export const googleEnabled = !!process.env.AUTH_GOOGLE_ID;

// Edge-safe Auth.js config (no database adapter). Shared between the proxy
// (route protection) and the full server config in `src/auth.ts`.
export const authConfig = {
  // trustHost is required when running behind a proxy (Render, etc.) so Auth.js
  // builds correct callback URLs from the forwarded host headers.
  trustHost: true,
  providers: googleEnabled ? [Google] : [],
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
