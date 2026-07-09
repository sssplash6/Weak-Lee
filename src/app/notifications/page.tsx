import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTimeTz } from "@/lib/dates";
import { NOTIFICATION_DOT } from "@/lib/notificationTypes";
import { BackLink } from "@/app/_components/BackLink";

type Row = {
  id: string;
  dot: string;
  message: string;
  dateLabel: string;
};

/**
 * The full notification history behind the header bell's "Expand" action —
 * everything the user has ever been notified about (fines, bonuses, assigned
 * tasks, reports), newest first, with the bell's 48-hour window broken out.
 */
export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, type: true, message: true, createdAt: true },
  });

  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const toRow = (n: (typeof notifications)[number]): Row => ({
    id: n.id,
    dot: NOTIFICATION_DOT[n.type],
    message: n.message,
    dateLabel: formatDateTimeTz(n.createdAt),
  });
  const recent = notifications
    .filter((n) => n.createdAt.getTime() >= cutoff)
    .map(toRow);
  const earlier = notifications
    .filter((n) => n.createdAt.getTime() < cutoff)
    .map(toRow);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Notifications</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Every update you&rsquo;ve received — fines, bonuses, assigned tasks
            and reports.
          </p>
        </div>
        <BackLink href="/dashboard" label="Dashboard" />
      </header>

      {notifications.length === 0 ? (
        <p className="px-1 text-sm text-muted-fg">
          Nothing yet — updates will appear here as they happen.
        </p>
      ) : (
        <>
          <Section title="Last 48 hours" rows={recent} emptyHint="Nothing new." />
          {earlier.length > 0 && (
            <div className="mt-8">
              <Section title="Earlier" rows={earlier} emptyHint="" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: Row[];
  emptyHint: string;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-1 text-sm text-muted-fg">{emptyHint}</p>
      ) : (
        <ul className="rounded-xl border border-line bg-surface px-4 py-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline gap-3 border-t border-line py-2.5 text-sm first:border-t-0"
            >
              <span
                className={`h-2 w-2 shrink-0 translate-y-px rounded-full ${r.dot}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 break-words text-ink">
                {r.message}
              </span>
              <span className="shrink-0 text-xs text-muted-fg">
                {r.dateLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
