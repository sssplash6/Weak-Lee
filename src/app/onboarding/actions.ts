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
 * department picked from the existing list) for the signed-in user, then send
 * them to the dashboard. Every field is required. New joiners always start as
 * a MEMBER — an admin promotes department leads on /departments.
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
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const birthday = String(formData.get("birthday") ?? "").trim();

  if (!name || !workPhone || !telegramUsername || !departmentId || !birthday) {
    return { error: "Please fill in every field." };
  }

  // The select only offers real departments, but the value is caller-supplied —
  // verify it names one before pointing the profile at it.
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) {
    return { error: "Pick a department from the list." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      workPhone,
      telegramUsername,
      departmentId: department.id,
      birthday: fromYmd(birthday),
    },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
