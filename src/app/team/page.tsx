import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveAvatar } from "@/lib/avatar";
import { formatYmd, toYmd } from "@/lib/dates";
import { BackLink } from "@/app/_components/BackLink";

/** A LinkedIn value (URL or handle) → a full https URL. */
function linkedinUrl(v: string): string {
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^.*linkedin\.com\/(in\/)?/i, "").replace(/^@/, "");
  return `https://www.linkedin.com/in/${handle}`;
}

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const members = await prisma.user.findMany({
    where: { name: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      department: true,
      workPhone: true,
      telegramUsername: true,
      linkedin: true,
      instagram: true,
      birthday: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">The Team</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {members.length} {members.length === 1 ? "member" : "members"}
          </p>
        </div>
        <BackLink href="/dashboard" label="My dashboard" />
      </header>

      {members.length === 0 ? (
        <p className="text-sm text-muted-fg">
          No members yet. People show up here once they finish onboarding and
          fill in their profile.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const avatar = resolveAvatar(m.avatar, m.email ?? m.name);
            const isYou = m.id === session.user.id;
            return (
              <div
                key={m.id}
                className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line text-xl ${avatar.bg}`}
                  >
                    <span aria-hidden="true">{avatar.emoji}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {m.name}
                      {isYou && (
                        <span className="ml-1.5 text-xs font-normal text-muted-fg">
                          (you)
                        </span>
                      )}
                    </p>
                    {m.department && (
                      <p className="truncate text-xs text-muted-fg">
                        {m.department}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="mt-4 flex flex-col gap-2 text-sm">
                  {m.email && (
                    <Row label="Email">
                      <a
                        href={`mailto:${m.email}`}
                        className="truncate text-ink hover:text-brand"
                      >
                        {m.email}
                      </a>
                    </Row>
                  )}
                  {m.workPhone && (
                    <Row label="Phone">
                      <a
                        href={`tel:${m.workPhone}`}
                        className="text-ink hover:text-brand"
                      >
                        {m.workPhone}
                      </a>
                    </Row>
                  )}
                  {m.telegramUsername && (
                    <Row label="Telegram">
                      <a
                        href={`https://t.me/${m.telegramUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink hover:text-brand"
                      >
                        @{m.telegramUsername}
                      </a>
                    </Row>
                  )}
                  {m.linkedin && (
                    <Row label="LinkedIn">
                      <a
                        href={linkedinUrl(m.linkedin)}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-ink hover:text-brand"
                      >
                        {m.linkedin}
                      </a>
                    </Row>
                  )}
                  {m.instagram && (
                    <Row label="Instagram">
                      <a
                        href={`https://instagram.com/${m.instagram}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink hover:text-brand"
                      >
                        @{m.instagram}
                      </a>
                    </Row>
                  )}
                  {m.birthday && (
                    <Row label="Birthday">
                      <span className="text-ink">
                        {formatYmd(toYmd(m.birthday))}
                      </span>
                    </Row>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-fg">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate">{children}</dd>
    </div>
  );
}
