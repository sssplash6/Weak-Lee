import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isProfileComplete } from "@/lib/profile";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      workPhone: true,
      telegramUsername: true,
      department: true,
    },
  });

  // Already onboarded — no reason to be here.
  if (user && isProfileComplete(user)) redirect("/dashboard");

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
          defaults={{
            name: user?.name ?? session.user.name ?? "",
            workPhone: user?.workPhone ?? "",
            telegramUsername: user?.telegramUsername ?? "",
            department: user?.department ?? "",
          }}
        />
      </div>
    </main>
  );
}
