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
 * Telegram and birthday stay required (they gate the dashboard); LinkedIn and
 * Instagram are optional. Email is not editable — it's the Google sign-in
 * identity — and the department/role pair is org structure, managed by admins
 * on /departments rather than self-served here.
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
  const birthday = String(formData.get("birthday") ?? "").trim();
  const linkedin = normalizeLinkedin(String(formData.get("linkedin") ?? ""));
  const instagram = normalizeInstagram(String(formData.get("instagram") ?? ""));

  if (!name || !workPhone || !telegramUsername || !birthday) {
    return { error: "Name, phone, Telegram and birthday are required.", saved: false };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      workPhone,
      telegramUsername,
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
