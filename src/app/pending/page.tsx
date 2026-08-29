import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Waiting for approval" };
import { auth, signOut } from "@/auth";
import { isApprovedUser } from "@/lib/approval";
import { COMPANY_EMAIL_DOMAIN } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { DepartmentRequest } from "./DepartmentRequest";

/**
 * The waiting room for non-company sign-ups: signed in, but not yet let in.
 *
 * It asks one question — which department are you joining — and that answer is
 * what pages a reviewer. Nothing is sent at sign-in any more: at that moment
 * nobody knows whose joiner this is, so the only honest alert went to every
 * lead in the company about a stranger. Answering here tells that department's
 * lead and tech@, and arrives at onboarding prefilled once they're approved.
 */
export default async function PendingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  if (await isApprovedUser(session.user)) redirect("/dashboard");

  const [me, departments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { requestedDepartment: { select: { id: true, name: true } } },
    }),
    // The same fixed list onboarding offers, mini departments included: a new
    // joiner may genuinely be joining one, and its queue still reaches tech@.
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const requested = me?.requestedDepartment ?? null;

  return (
    <main className="flex flex-1 items-center justify-center bg-canvas px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">
          freshman.academy
        </div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-2xl">
          ⏳
        </div>
        <h1 className="text-2xl font-bold text-ink">Almost in</h1>
        <p className="mt-2 text-sm text-muted-fg">
          {`Your account (${session.user.email ?? "no email"}) isn't on the ${COMPANY_EMAIL_DOMAIN} domain, so a department lead approves it before you're in.`}
          {requested
            ? " They've been notified — check back in a bit, there's nothing else to do on your side."
            : " Tell us where you belong and we'll let them know."}
        </p>

        <DepartmentRequest departments={departments} requested={requested} />

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-canvas"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
