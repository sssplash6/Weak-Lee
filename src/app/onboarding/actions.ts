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
 * departments picked from the existing list — one or more) for the signed-in
 * user, then send them to the dashboard. Every field is required. New joiners
 * always start as a MEMBER in each picked department — an admin promotes
 * department leads on /departments.
 */
export async function completeProfile(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You're not signed in." };
  const userId = session.user.id;

  const name = String(formData.get("name") ?? "").trim();
  const workPhone = String(formData.get("workPhone") ?? "").trim();
  const telegramUsername = normalizeTelegram(
    String(formData.get("telegramUsername") ?? ""),
  );
  const departmentIds = [
    ...new Set(
      formData
        .getAll("departmentIds")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];
  const birthday = String(formData.get("birthday") ?? "").trim();

  if (!name || !workPhone || !telegramUsername || !birthday) {
    return { error: "Please fill in every field." };
  }
  if (departmentIds.length === 0) {
    return { error: "Pick at least one department." };
  }

  // The pills only offer real departments, but the values are caller-supplied —
  // verify every id names one before joining them.
  const found = await prisma.department.findMany({
    where: { id: { in: departmentIds } },
    select: { id: true },
  });
  if (found.length !== departmentIds.length) {
    return { error: "Pick departments from the list." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      workPhone,
      telegramUsername,
      birthday: fromYmd(birthday),
      // Their first seats, always as members. Upsert-shaped so re-running
      // onboarding can never demote a lead membership an admin granted.
      memberships: {
        connectOrCreate: departmentIds.map((departmentId) => ({
          where: {
            userId_departmentId: { userId, departmentId },
          },
          create: { departmentId },
        })),
      },
    },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
