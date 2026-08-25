"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTelegram } from "@/lib/profile";
import { isApprovedUser } from "@/lib/approval";
import { AVATAR_EMOJIS } from "@/lib/avatar";
import { parseYmd } from "@/lib/dates";
import { claimVacantMiniLeads, miniLeadNotice } from "@/lib/miniDepartments";
import { notify } from "@/lib/notifications";

export type OnboardingState = { error: string | null };

/**
 * Save the onboarding profile (full name, work phone, Telegram handle,
 * departments picked from the existing list — one or more, and the animal
 * they'll wear across the app) for the signed-in user, then send them to the
 * dashboard. Every field is required. New joiners start as a MEMBER in each
 * picked department — an admin promotes department leads on /departments — the
 * one exception being a mini department with no head yet, which its first
 * joiner leads (see lib/miniDepartments.ts).
 */
export async function completeProfile(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You're not signed in." };
  const userId = session.user.id;

  // The /onboarding page gates on approval, but this action is reachable
  // without it — and it hands out department seats, one of which can now be a
  // mini department's lead seat (see lib/miniDepartments.ts). Gate it here too.
  if (!(await isApprovedUser({ id: userId, email: session.user.email }))) {
    return { error: "Your account is still waiting for approval." };
  }

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
  const avatar = String(formData.get("avatar") ?? "").trim();

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

  // An animal is offered pre-picked, so an empty value means the roster was
  // full — leave it unset and let lib/assignAvatar.ts backfill one later.
  if (avatar && !AVATAR_EMOJIS.includes(avatar)) {
    return { error: "Pick an animal from the list." };
  }

  const birthdayDate = parseYmd(birthday);
  if (!birthdayDate) {
    return { error: "That birthday isn't a real date." };
  }

  try {
    // One transaction so the mini-department promotion can't land without the
    // seat it promotes, and so two people joining an empty mini department at
    // once can't both come out as its lead.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name,
          workPhone,
          telegramUsername,
          avatar: avatar || undefined,
          birthday: birthdayDate,
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
      const claimed = await claimVacantMiniLeads(tx, userId, departmentIds);
      // They arrive on the dashboard already leading it — say why.
      for (const d of claimed) {
        await notify(tx, userId, "OTHER", miniLeadNotice(d.name));
      }
    });
  } catch (e) {
    // One animal per person is a DB constraint: two people finishing sign-up
    // at once can pick the same one. Say so instead of failing the whole form —
    // everything they typed is still on screen.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return { error: "That animal was just taken — pick another one." };
    }
    throw e;
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
