"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeInstagram,
  normalizeLinkedin,
  normalizeTelegram,
} from "@/lib/profile";
import { fromYmd } from "@/lib/dates";

export type ProfileState = { error: string | null; saved: boolean };

/**
 * Save the editable profile fields for the signed-in user. Name, work phone,
 * Telegram, department and birthday stay required (they gate the dashboard);
 * LinkedIn and Instagram are optional. Email is not editable — it's the Google
 * sign-in identity.
 */
export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You're not signed in.", saved: false };

  const name = String(formData.get("name") ?? "").trim();
  const workPhone = String(formData.get("workPhone") ?? "").trim();
  const telegramUsername = normalizeTelegram(
    String(formData.get("telegramUsername") ?? ""),
  );
  const department = String(formData.get("department") ?? "").trim();
  const birthday = String(formData.get("birthday") ?? "").trim();
  const linkedin = normalizeLinkedin(String(formData.get("linkedin") ?? ""));
  const instagram = normalizeInstagram(String(formData.get("instagram") ?? ""));

  if (!name || !workPhone || !telegramUsername || !department || !birthday) {
    return { error: "Name, phone, Telegram, department and birthday are required.", saved: false };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      workPhone,
      telegramUsername,
      department,
      birthday: fromYmd(birthday),
      linkedin: linkedin || null,
      instagram: instagram || null,
    },
  });

  revalidatePath("/profile");
  revalidatePath("/team");
  revalidatePath("/dashboard");
  return { error: null, saved: true };
}
