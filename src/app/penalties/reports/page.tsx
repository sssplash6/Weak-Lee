import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { resolveAvatar } from "@/lib/avatar";
import { formatDateTimeTz } from "@/lib/dates";
import { BackLink } from "@/app/_components/BackLink";
import { ReportList, type ReportView } from "../_components/ReportList";
import type { ColleagueReportStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Colleague reports" };

const FILTERS: { key: string; label: string; status: ColleagueReportStatus | null }[] = [
  { key: "open", label: "Open", status: "OPEN" },
  { key: "actioned", label: "Actioned", status: "ACTIONED" },
  { key: "dismissed", label: "Dismissed", status: "DISMISSED" },
  { key: "all", label: "All", status: null },
];

/**
 * Where colleague reports go to be worked, rather than to be missed.
 *
 * Two audiences, one page. An admin sees every report and can close it; anyone
 * else sees only the ones they filed themselves, read-only — filing used to be
 * a message into the dark, and seeing your own report marked actioned is the
 * whole difference between a form and a process.
 */
export default async function ColleagueReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);

  const viewerIsAdmin = isAdmin(session.user.email);
  const sp = await searchParams;
  // Non-admins get one list — their own — so the filter is admin-only too.
  const active =
    (viewerIsAdmin &&
      FILTERS.find((f) => f.key === (typeof sp.status === "string" ? sp.status : ""))) ||
    FILTERS[0];

  const reports = await prisma.colleagueReport.findMany({
    where: {
      ...(viewerIsAdmin
        ? active.status
          ? { status: active.status }
          : {}
        : { reporterId: session.user.id }),
    },
    // Oldest-open-first would bury today's report under a backlog; newest first
    // matches every other feed in the app.
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      reason: true,
      createdAt: true,
      status: true,
      closedAt: true,
      resolution: true,
      legacyReporter: true,
      legacySubjects: true,
      reporter: { select: { id: true, name: true, email: true, avatar: true } },
      closedBy: { select: { name: true, email: true } },
      subjects: {
        select: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
    },
  });

  const openCount = viewerIsAdmin
    ? await prisma.colleagueReport.count({ where: { status: "OPEN" } })
    : 0;

  const person = (u: {
    id: string;
    name: string | null;
    email: string | null;
    avatar: string | null;
  }) => {
    const av = resolveAvatar(u.avatar, u.email ?? u.id);
    return { id: u.id, name: u.name ?? u.email ?? "—", emoji: av.emoji, bg: av.bg };
  };

  const views: ReportView[] = reports.map((r) => ({
    id: r.id,
    reason: r.reason,
    dateLabel: formatDateTimeTz(r.createdAt),
    status: r.status,
    // A report survives the account that filed it (reporter is SetNull), and a
    // backfilled one may only ever have had the name — either way the card
    // still reads rather than showing a blank.
    reporter: r.reporter
      ? person(r.reporter)
      : {
          id: "",
          name: r.legacyReporter ?? "A former colleague",
          emoji: "👤",
          bg: "bg-canvas",
        },
    subjects: r.subjects.map((s) => person(s.user)),
    legacySubjects: (r.legacySubjects ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean),
    closedLabel: r.closedAt
      ? `${r.closedBy?.name ?? r.closedBy?.email ?? "An admin"} · ${formatDateTimeTz(r.closedAt)}`
      : null,
    resolution: r.resolution,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Colleague reports</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {viewerIsAdmin
              ? "Everything filed from the report form, and what was done about it."
              : "The reports you’ve filed, and where each one got to."}
          </p>
        </div>
        <BackLink href="/penalties" label="Penalties" />
      </header>

      {viewerIsAdmin && (
        <nav className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const on = f.key === active.key;
            return (
              <Link
                key={f.key}
                href={`/penalties/reports?status=${f.key}`}
                aria-current={on ? "page" : undefined}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  on
                    ? "border-brand bg-brand text-white"
                    : "border-line text-muted-fg hover:bg-canvas hover:text-ink"
                }`}
              >
                {f.label}
                {f.status === "OPEN" && openCount > 0 && (
                  <span
                    className={`ml-1.5 tabular-nums ${on ? "text-white/80" : "text-muted-fg"}`}
                  >
                    {openCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      <ReportList reports={views} canManage={viewerIsAdmin} />
    </div>
  );
}
