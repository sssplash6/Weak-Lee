import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next.js 16 renamed `middleware` to `proxy` (runs on the Node.js runtime).
// Use the edge-safe Auth.js config (no Prisma adapter) for route protection.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Run on everything except Next internals, the auth API, and static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
