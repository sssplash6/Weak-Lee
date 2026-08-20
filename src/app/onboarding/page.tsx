import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Finish your profile" };
import { auth } from "@/auth";
import { assertApproved } from "@/lib/approval";
import { prisma } from "@/lib/prisma";
import { isProfileComplete } from "@/lib/profile";
import { AVATAR_EMOJIS, hashSeed } from "@/lib/avatar";
import { toYmd } from "@/lib/dates";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  await assertApproved(session.user);

  const [user, departments, avatarOwners] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        workPhone: true,
        telegramUsername: true,
        avatar: true,
        memberships: { select: { departmentId: true } },
        birthday: true,
      },
    }),
    // The fixed list a new joiner picks their departments from. Admins manage
    // it on /departments; there's no free-text fallback.
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Animals already worn by teammates — the picker greys those out.
    prisma.user.findMany({
      where: { avatar: { not: null } },
      select: { avatar: true },
    }),
  ]);

  // Already onboarded — no reason to be here.
  if (user && isProfileComplete(user)) redirect("/dashboard");

  // Suggest a free animal so the field arrives filled in: their own if they
  // somehow have one already, else a seed-derived pick from what's left (the
  // same offset trick lib/assignAvatar.ts uses, so people don't all land on
  // the first animal in the list).
  // Their own animal (if a dashboard touch already auto-assigned one) is never
  // a blocker for them — only teammates' picks are off-limits.
  const takenByOthers = avatarOwners
    .map((u) => u.avatar as string)
    .filter((e) => e !== user?.avatar);
  const free = AVATAR_EMOJIS.filter((e) => !takenByOthers.includes(e));
  const suggested =
    user?.avatar ??
    (free.length > 0
      ? free[hashSeed(session.user.email ?? session.user.id) % free.length]
      : null);

  return (
    <main className="flex flex-1 items-center justify-center bg-canvas px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="text-center">
          <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="text-2xl font-bold text-ink">Finish your profile</h1>
          <p className="mt-2 text-sm text-muted-fg">
            A few details before you start. This is a one-time setup.
          </p>
        </div>

        <OnboardingForm
          departments={departments}
          takenByOthers={takenByOthers}
          defaults={{
            name: user?.name ?? session.user.name ?? "",
            workPhone: user?.workPhone ?? "",
            telegramUsername: user?.telegramUsername ?? "",
            departmentIds: user?.memberships.map((m) => m.departmentId) ?? [],
            birthday: user?.birthday ? toYmd(user.birthday) : "",
            avatar: suggested,
          }}
        />
      </div>
    </main>
  );
}
