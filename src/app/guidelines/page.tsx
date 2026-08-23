import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { stat } from "node:fs/promises";

export const metadata: Metadata = { title: "Guidelines" };
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { BackLink } from "@/app/_components/BackLink";
import { LockIcon } from "@/app/dashboard/_components/icons";
import {
  ALL_GUIDES,
  canReadGuide,
  FEATURED_GUIDE,
  GUIDE_GROUPS,
  guidePdfPath,
  guideDepartmentLabel,
  guideHref,
  type Guide,
  type GuideTone,
} from "@/lib/guidelines";

// One accent per document. Class names are spelled out (not built from the tone
// string) so Tailwind sees them; the tokens behind them are re-stepped for dark
// in globals.css, so no `dark:` variants are needed.
const TONE: Record<GuideTone, { wash: string; ink: string; rule: string }> = {
  indigo: {
    wash: "bg-guide-indigo-soft",
    ink: "text-guide-indigo-ink",
    rule: "bg-guide-indigo-ink",
  },
  teal: {
    wash: "bg-guide-teal-soft",
    ink: "text-guide-teal-ink",
    rule: "bg-guide-teal-ink",
  },
  plum: {
    wash: "bg-guide-plum-soft",
    ink: "text-guide-plum-ink",
    rule: "bg-guide-plum-ink",
  },
  cyan: {
    wash: "bg-guide-cyan-soft",
    ink: "text-guide-cyan-ink",
    rule: "bg-guide-cyan-ink",
  },
  olive: {
    wash: "bg-guide-olive-soft",
    ink: "text-guide-olive-ink",
    rule: "bg-guide-olive-ink",
  },
};

/** "482 KB" — the real size on disk, so nobody opens a 5 MB file blind. */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Size of each guide's PDF, read from private/guidelines at request time and
 * keyed by slug. Best-effort: a file that can't be stat'ed (a different runtime
 * layout) simply shows no size rather than failing the page.
 */
async function guideSizes(): Promise<Map<string, string>> {
  const entries = await Promise.all(
    ALL_GUIDES.map(async (g) => {
      try {
        const s = await stat(guidePdfPath(g.pdf));
        return [g.slug, formatBytes(s.size)] as const;
      } catch {
        return [g.slug, ""] as const;
      }
    }),
  );
  return new Map(entries.filter(([, size]) => size !== ""));
}

export default async function GuidelinesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);

  // The viewer's department decides which guides unlock. It's a real Department
  // row now, but someone mid-onboarding can still be without one.
  const [viewer, sizes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        memberships: { select: { department: { select: { name: true } } } },
      },
    }),
    guideSizes(),
  ]);
  const me = {
    departments: viewer?.memberships.map((m) => m.department.name) ?? [],
    isAdmin: isAdmin(session.user.email),
  };
  const totalPages = ALL_GUIDES.reduce((s, g) => s + g.pages, 0);
  const openToMe = ALL_GUIDES.filter((g) => canReadGuide(g, me)).length;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            Internal
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Guidelines</h1>
          <p className="mt-1 text-sm text-muted-fg">
            {`How we work, written down — ${ALL_GUIDES.length} guides, ${totalPages} pages. ${
              openToMe === ALL_GUIDES.length
                ? "All of them are open to you."
                : `${openToMe} are open to you; the rest belong to another department.`
            }`}
          </p>
          {me.departments.length === 0 && (
            <p className="mt-1 text-sm text-accent-ink">
              You&rsquo;re not in a department yet, so department guides stay
              locked — finish onboarding or ask an admin to place you.
            </p>
          )}
        </div>
        <BackLink href="/dashboard" label="My dashboard" />
      </header>

      {/* Jump strip: every guide in its own colour, one click away. */}
      <nav
        aria-label="Jump to a guide"
        className="mb-8 flex flex-wrap gap-2 border-b border-line pb-5"
      >
        {ALL_GUIDES.map((g) => {
          const tone = TONE[g.tone];
          return (
            <a
              key={g.slug}
              href={`#${g.slug}`}
              className={`inline-flex items-center gap-2 rounded-full ${tone.wash} px-3 py-1.5 text-xs font-semibold transition hover:opacity-80`}
            >
              <span className={`font-black tracking-tight ${tone.ink}`}>
                {g.monogram}
              </span>
              <span className="text-ink">{g.title}</span>
            </a>
          );
        })}
      </nav>

      {/* Everyone's guide, on its own and wider than the rest. */}
      <section className="mb-10">
        <h2 className="mb-1 text-sm font-semibold text-ink">Everyone</h2>
        <p className="mb-3 text-xs text-muted-fg">
          The one guide that applies to every person in every department.
        </p>
        <GuideCard
          guide={FEATURED_GUIDE}
          size={sizes.get(FEATURED_GUIDE.slug)}
          locked={!canReadGuide(FEATURED_GUIDE, me)}
          featured
        />
      </section>

      {/* Groups sit on the same two-column grid as the cards do, so a group
          holding a single guide takes one column and pairs up with the next
          one-guide group instead of reserving a whole row and leaving the space
          beside its card empty. Groups with more than one guide still span the
          full width and lay their cards out two across. */}
      <div className="mb-10 grid gap-x-4 gap-y-10 lg:grid-cols-2">
        {GUIDE_GROUPS.map((group) => {
          const wide = group.guides.length > 1;
          return (
            <section key={group.title} className={wide ? "lg:col-span-2" : ""}>
              <h2 className="mb-1 text-sm font-semibold text-ink">
                {group.title}
              </h2>
              <p className="mb-3 text-xs text-muted-fg">{group.blurb}</p>
              <div className={`grid gap-4 ${wide ? "lg:grid-cols-2" : ""}`}>
                {group.guides.map((g) => (
                  <GuideCard
                    key={g.slug}
                    guide={g}
                    size={sizes.get(g.slug)}
                    locked={!canReadGuide(g, me)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-muted-fg">
        These documents are internal to Freshman Academy — don&rsquo;t forward
        them outside the team. Spotted something out of date? Tell the owner
        listed on the guide.
      </p>
    </main>
  );
}

/**
 * One document: a coloured banner that echoes the PDF's own cover (kicker,
 * title, stamped monogram), then what's inside it, who owns it, and the ways to
 * read it. `featured` widens the section list to two columns.
 */
function GuideCard({
  guide: g,
  size,
  locked = false,
  featured = false,
}: {
  guide: Guide;
  size?: string;
  /** Belongs to another department: shown in full, but not openable. */
  locked?: boolean;
  featured?: boolean;
}) {
  const tone = TONE[g.tone];
  // Shown on every department-scoped guide, whether or not it's yours, so the
  // scoping is legible rather than mysterious.
  const deptLabel = guideDepartmentLabel(g);

  return (
    <article
      id={g.slug}
      className="flex scroll-mt-6 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
    >
      {/* Banner */}
      <div className={`relative overflow-hidden ${tone.wash} px-5 pb-4 pt-5`}>
        <div className={`absolute inset-x-0 top-0 h-1 ${tone.rule}`} />
        {/* Monogram stamped into the bottom corner and bleeding off the banner,
            like a watermark. Kept low and right of everything: the text column
            below reserves room for it, so it never sits under a word. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -bottom-5 right-1 select-none text-6xl font-black leading-none tracking-tighter opacity-10 ${tone.ink}`}
        >
          {g.monogram}
        </span>

        <div className="relative pr-14">
          <div className="flex items-start justify-between gap-3">
            <p
              className={`text-[11px] font-bold uppercase tracking-widest ${tone.ink}`}
            >
              {g.kicker}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {deptLabel && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide ${tone.ink}`}
                  title={`Only the ${deptLabel} department can open this guide`}
                >
                  {locked && <LockIcon className="h-2.5 w-2.5" />}
                  {deptLabel}
                </span>
              )}
              {g.version && (
                <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-fg">
                  {g.version}
                </span>
              )}
            </div>
          </div>

          <h3
            className={`mt-2 font-bold text-ink ${
              featured ? "text-2xl" : "text-lg"
            }`}
          >
            {g.title}
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm text-ink/80">{g.purpose}</p>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-muted-fg">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.rule}`} />
            {[`${g.pages} pages`, g.dated, size].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      {/* What's inside */}
      <div className="flex flex-1 flex-col px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
          Inside
        </p>
        {/* Two columns on the featured card, but flowing DOWN each column so the
            numbering still reads 1,2,3… top to bottom. */}
        <ol
          className={`mt-2 grid gap-x-6 gap-y-1.5 ${
            featured ? "sm:grid-flow-col sm:grid-cols-2" : ""
          }`}
          style={
            featured
              ? {
                  gridTemplateRows: `repeat(${Math.ceil(
                    g.sections.length / 2,
                  )}, minmax(0, auto))`,
                }
              : undefined
          }
        >
          {g.sections.map((s, i) => (
            <li key={s} className="flex items-baseline gap-2.5 text-sm">
              <span
                className={`w-3.5 shrink-0 text-right text-[11px] font-bold tabular-nums ${tone.ink}`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 text-ink">{s}</span>
            </li>
          ))}
        </ol>

        {(g.owner || g.approvedBy) && (
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3">
            {g.owner && <Meta label="Owner" person={g.owner} />}
            {g.approvedBy && (
              <Meta label="Approved by" person={g.approvedBy} />
            )}
          </dl>
        )}
      </div>

      {/* Ways to read it — or why you can't */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        {locked ? (
          <p className="flex items-center gap-2 text-xs text-muted-fg">
            <LockIcon className="h-3.5 w-3.5 shrink-0" />
            {`For the ${deptLabel} department. Ask ${
              g.owner ? g.owner.name : "an admin"
            } if you need it.`}
          </p>
        ) : (
          <>
            <a
              href={guideHref(g)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Read guide
            </a>
            <a
              href={guideHref(g, true)}
              download
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-canvas"
            >
              Download
            </a>
            <span className="ml-auto text-[11px] font-medium uppercase tracking-wide text-muted-fg">
              PDF
            </span>
          </>
        )}
      </div>
    </article>
  );
}

function Meta({
  label,
  person,
}: {
  label: string;
  person: { name: string; role: string };
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{person.name}</dd>
      <dd className="text-xs text-muted-fg">{person.role}</dd>
    </div>
  );
}
