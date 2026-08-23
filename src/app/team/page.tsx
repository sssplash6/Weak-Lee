import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "The Team" };
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
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
  await assertApproved(session.user);

  // Approved teammates only. Keyed off a name alone, the directory also listed
  // sign-ups still waiting in the queue — people who can't reach any page but
  // /pending — handing their name and email to the whole company as though they
  // already worked here. Everyone predating the approval gate was backfilled as
  // approved by its migration, so nobody real drops off.
  const members = await prisma.user.findMany({
    where: { name: { not: null }, approvedAt: { not: null } },
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

  // Shape each person once; the phone and desktop layouts below are two
  // renderings of this same list, not two queries.
  const rows = members.map((m) => {
    const avatar = resolveAvatar(m.avatar, m.email ?? m.name);
    return {
      id: m.id,
      name: m.name,
      isYou: m.id === session.user.id,
      emoji: avatar.emoji,
      bg: avatar.bg,
      department: departmentLine(m.memberships),
      lead: isLead(m.memberships),
      email: m.email,
      workPhone: m.workPhone,
      telegram: m.telegramUsername,
      linkedin: m.linkedin,
      instagram: m.instagram,
      birthdayLabel: m.birthday ? formatYmd(toYmd(m.birthday)) : null,
    };
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
        <>
          {/* Phone: one card per person. Nine columns can't be squeezed into a
              phone's width, and forcing a 58rem table through a 20rem viewport
              means dragging sideways through every field of every row. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-line bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-base ${r.bg}`}
                    aria-hidden="true"
                  >
                    {r.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {r.name}
                      {r.isYou && (
                        <span className="ml-1.5 text-xs font-normal text-muted-fg">
                          (you)
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-fg">
                      {r.department}
                    </span>
                  </span>
                  {r.lead && <RoleChip />}
                </div>
                <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                  {r.email && (
                    <Field label="Email">
                      <EmailLink email={r.email} />
                    </Field>
                  )}
                  {r.workPhone && (
                    <Field label="Phone">
                      <PhoneLink phone={r.workPhone} />
                    </Field>
                  )}
                  {r.telegram && (
                    <Field label="Telegram">
                      <TelegramLink handle={r.telegram} />
                    </Field>
                  )}
                  {r.linkedin && (
                    <Field label="LinkedIn">
                      <LinkedinLink value={r.linkedin} />
                    </Field>
                  )}
                  {r.instagram && (
                    <Field label="Instagram">
                      <InstagramLink handle={r.instagram} />
                    </Field>
                  )}
                  {r.birthdayLabel && (
                    <Field label="Birthday">{r.birthdayLabel}</Field>
                  )}
                </dl>
              </li>
            ))}
          </ul>

          {/* Tablet and up: one row per person so the whole directory reads
              down a column at a time. Still wider than a small tablet, so the
              table scrolls sideways inside this box — and the name column pins
              itself so it stays visible while it does. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm md:block">
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
                {rows.map((r) => (
                  <tr
                    key={r.id}
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
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-base ${r.bg}`}
                          aria-hidden="true"
                        >
                          {r.emoji}
                        </span>
                        <span className="font-semibold whitespace-nowrap text-ink">
                          {r.name}
                          {r.isYou && (
                            <span className="ml-1.5 text-xs font-normal text-muted-fg">
                              (you)
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                    <Cell>{r.department}</Cell>
                    <Cell>
                      {/* The label the whole expectations system keys off:
                          leads owe meetings and weekly/monthly goals, members
                          don't — so leads get the chip, members stay quiet. */}
                      {r.lead ? (
                        <RoleChip />
                      ) : (
                        <span className="text-muted-fg">{ROLE_LABEL.MEMBER}</span>
                      )}
                    </Cell>
                    <Cell>{r.email && <EmailLink email={r.email} />}</Cell>
                    <Cell>
                      {r.workPhone && <PhoneLink phone={r.workPhone} />}
                    </Cell>
                    <Cell>
                      {r.telegram && <TelegramLink handle={r.telegram} />}
                    </Cell>
                    <Cell>
                      {r.linkedin && <LinkedinLink value={r.linkedin} />}
                    </Cell>
                    <Cell>
                      {r.instagram && <InstagramLink handle={r.instagram} />}
                    </Cell>
                    <Cell>{r.birthdayLabel}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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

/** The lead badge — the one role the expectations system keys off. */
function RoleChip() {
  return (
    <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
      {ROLE_LABEL.LEAD}
    </span>
  );
}

/** One labelled line inside a phone card. Only rendered for filled-in fields. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-xs text-muted-fg">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-ink">{children}</dd>
    </div>
  );
}

const LINK_CLASS = "text-ink hover:text-brand";

function EmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className={LINK_CLASS}>
      {email}
    </a>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone}`} className={LINK_CLASS}>
      {phone}
    </a>
  );
}

function TelegramLink({ handle }: { handle: string }) {
  return (
    <a
      href={`https://t.me/${handle}`}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLASS}
    >
      {`@${handle}`}
    </a>
  );
}

function LinkedinLink({ value }: { value: string }) {
  return (
    <a
      href={linkedinUrl(value)}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLASS}
    >
      {value}
    </a>
  );
}

function InstagramLink({ handle }: { handle: string }) {
  return (
    <a
      href={`https://instagram.com/${handle}`}
      target="_blank"
      rel="noreferrer"
      className={LINK_CLASS}
    >
      {`@${handle}`}
    </a>
  );
}
