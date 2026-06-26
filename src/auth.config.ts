import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Show Google sign-in only when its credentials are configured, so a demo that
// relies on dev login doesn't surface a broken button.
export const googleEnabled = !!process.env.AUTH_GOOGLE_ID;

// Only company accounts may sign in. Enforced server-side in the signIn
// callback below; the `hd` param on the provider is just a UI hint to Google.
export const ALLOWED_EMAIL_DOMAIN = "freshman.academy";

function emailInDomain(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

// Edge-safe Auth.js config (no database adapter). Shared between the proxy
// (route protection) and the full server config in `src/auth.ts`.
export const authConfig = {
  // trustHost is required when running behind a proxy (Render, etc.) so Auth.js
  // builds correct callback URLs from the forwarded host headers.
  trustHost: true,
  providers: googleEnabled
    ? [
        Google({
          // Hint Google Workspace to default to the company domain. Not a
          // security control — the real check is the signIn callback.
          authorization: {
            params: { hd: ALLOWED_EMAIL_DOMAIN, prompt: "select_account" },
          },
        }),
      ]
    : [],
  pages: {
    signIn: "/signin",
    // Send auth errors (e.g. a rejected non-company account) back to the
    // sign-in page so we can show a friendly message instead of the default
    // /api/auth/error screen.
    error: "/signin",
  },
  callbacks: {
    // Gate every sign-in to company accounts. Returning false sends the user
    // back to /signin?error=AccessDenied. The dev login uses a freshman.academy
    // address, so it passes this check too.
    signIn({ user }) {
      return emailInDomain(user.email);
    },
    // Route protection. Runs in middleware for every matched request.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnOnboarding = nextUrl.pathname.startsWith("/onboarding");
      const isOnSignin = nextUrl.pathname.startsWith("/signin");

      if (isOnDashboard || isOnOnboarding) {
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
