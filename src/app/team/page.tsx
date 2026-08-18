import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "The Team" };
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveAvatar } from "@/lib/avatar";
import { departmentLine, isLead, ROLE_LABEL } from "@/lib/team";
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
      memberships: {
        select: { role: true, department: { select: { name: true } } },
      },
      workPhone: true,
      telegramUsername: true,
      linkedin: true,
      instagram: true,
      birthday: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-ink">The Team</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {`${members.length} ${members.length === 1 ? "person" : "people"} · ${
              members.filter((m) => isLead(m.memberships)).length
            } department leads`}
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
        /* One row per person so the whole directory reads down a column at a
           time. Too wide for a phone, so the table scrolls sideways inside this
           box rather than wrapping every cell into a tall, unreadable row —
           and the name column pins itself so it stays visible while it does. */
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[58rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-muted-fg">
                <th
                  scope="col"
                  className="sticky left-0 bg-surface px-4 py-3 shadow-[inset_-1px_0_0_0_var(--color-line)]"
                >
                  Person
                </th>
                <th scope="col" className="px-4 py-3">
                  Department
                </th>
                <th scope="col" className="px-4 py-3">
                  Role
                </th>
                <th scope="col" className="px-4 py-3">
                  Email
                </th>
                <th scope="col" className="px-4 py-3">
                  Phone
                </th>
                <th scope="col" className="px-4 py-3">
                  Telegram
                </th>
                <th scope="col" className="px-4 py-3">
                  LinkedIn
                </th>
                <th scope="col" className="px-4 py-3">
                  Instagram
                </th>
                <th scope="col" className="px-4 py-3">
                  Birthday
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const avatar = resolveAvatar(m.avatar, m.email ?? m.name);
                const isYou = m.id === session.user.id;
                return (
                  <tr
                    key={m.id}
                    className="group border-b border-line/60 transition last:border-0 hover:bg-canvas"
                  >
                    {/* The pinned cell needs the row's hover colour of its own —
                        sitting above the others, it can't inherit it. Its right
                        edge, which the scrolling columns slide behind, is an
                        inset shadow rather than a border: `border-collapse:
                        collapse` hands borders to the table to paint, and the
                        table doesn't move with the sticky cell, so a border-r
                        here never shows up. */}
                    <th
                      scope="row"
                      className="sticky left-0 bg-surface px-4 py-3 font-normal shadow-[inset_-1px_0_0_0_var(--color-line)] transition group-hover:bg-canvas"
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-base ${avatar.bg}`}
                          aria-hidden="true"
                        >
                          {avatar.emoji}
                        </span>
                        <span className="font-semibold whitespace-nowrap text-ink">
                          {m.name}
                          {isYou && (
                            <span className="ml-1.5 text-xs font-normal text-muted-fg">
                              (you)
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                    <Cell>{departmentLine(m.memberships)}</Cell>
                    <Cell>
                      {/* The label the whole expectations system keys off:
                          leads owe meetings and weekly/monthly goals, members
                          don't — so leads get the chip, members stay quiet. */}
                      {isLead(m.memberships) ? (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
                          {ROLE_LABEL.LEAD}
                        </span>
                      ) : (
                        <span className="text-muted-fg">{ROLE_LABEL.MEMBER}</span>
                      )}
                    </Cell>
                    <Cell>
                      {m.email && (
                        <a
                          href={`mailto:${m.email}`}
                          className="text-ink hover:text-brand"
                        >
                          {m.email}
                        </a>
                      )}
                    </Cell>
                    <Cell>
                      {m.workPhone && (
                        <a
                          href={`tel:${m.workPhone}`}
                          className="text-ink hover:text-brand"
                        >
                          {m.workPhone}
                        </a>
                      )}
                    </Cell>
                    <Cell>
                      {m.telegramUsername && (
                        <a
                          href={`https://t.me/${m.telegramUsername}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ink hover:text-brand"
                        >
                          {`@${m.telegramUsername}`}
                        </a>
                      )}
                    </Cell>
                    <Cell>
                      {m.linkedin && (
                        <a
                          href={linkedinUrl(m.linkedin)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ink hover:text-brand"
                        >
                          {m.linkedin}
                        </a>
                      )}
                    </Cell>
                    <Cell>
                      {m.instagram && (
                        <a
                          href={`https://instagram.com/${m.instagram}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ink hover:text-brand"
                        >
                          {`@${m.instagram}`}
                        </a>
                      )}
                    </Cell>
                    <Cell>
                      {m.birthday && formatYmd(toYmd(m.birthday))}
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/**
 * One table cell. Anything falsy — a field nobody filled in — reads as a dash
 * instead of leaving a blank that looks like a rendering fault.
 */
function Cell({ children }: { children?: React.ReactNode }) {
  return (
    <td className="px-4 py-3 whitespace-nowrap text-ink">
      {children || <span className="text-muted-fg">—</span>}
    </td>
  );
}
