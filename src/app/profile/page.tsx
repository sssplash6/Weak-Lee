import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toYmd } from "@/lib/dates";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      workPhone: true,
      telegramUsername: true,
      department: true,
      birthday: true,
      linkedin: true,
      instagram: true,
    },
  });
  if (!user) redirect("/signin");

  return (
    <main className="flex flex-1 justify-center bg-canvas px-6 py-10">
      <div className="w-full max-w-lg">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-muted-fg transition hover:text-ink"
        >
          ← Back to dashboard
        </Link>

        <div className="mt-4 rounded-2xl border border-line bg-surface p-8 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand">
            freshman.academy
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink">Your profile</h1>
          <p className="mt-2 text-sm text-muted-fg">
            Update your details. Socials appear on{" "}
            <Link href="/team" className="font-medium text-brand hover:underline">
              The Team
            </Link>
            .
          </p>

          <ProfileForm
            defaults={{
              name: user.name ?? "",
              email: user.email ?? "",
              workPhone: user.workPhone ?? "",
              telegramUsername: user.telegramUsername ?? "",
              department: user.department ?? "",
              birthday: user.birthday ? toYmd(user.birthday) : "",
              linkedin: user.linkedin ?? "",
              instagram: user.instagram ?? "",
            }}
          />
        </div>
      </div>
    </main>
  );
}
