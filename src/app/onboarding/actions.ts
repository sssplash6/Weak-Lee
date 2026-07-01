"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTelegram } from "@/lib/profile";
import { fromYmd } from "@/lib/dates";

export type OnboardingState = { error: string | null };

/**
 * Save the onboarding profile (full name, work phone, Telegram handle,
 * department) for the signed-in user, then send them to the dashboard. All
 * four fields are required.
 */
export async function completeProfile(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You're not signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const workPhone = String(formData.get("workPhone") ?? "").trim();
  const telegramUsername = normalizeTelegram(
    String(formData.get("telegramUsername") ?? ""),
  );
  const department = String(formData.get("department") ?? "").trim();
  const birthday = String(formData.get("birthday") ?? "").trim();

  if (!name || !workPhone || !telegramUsername || !department || !birthday) {
    return { error: "Please fill in every field." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      workPhone,
      telegramUsername,
      department,
      birthday: fromYmd(birthday),
    },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
