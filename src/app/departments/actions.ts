"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notifications";
import type { TeamRole } from "@/lib/team";

/** Every view that shows department structure, refreshed after it changes. */
function revalidateStructure() {
  revalidatePath("/departments");
  revalidatePath("/admin");
  revalidatePath("/team");
  revalidatePath("/onboarding");
  revalidatePath("/profile");
  revalidatePath("/dashboard");
}

async function requireAdmin() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Not authorized");
  }
  return session!;
}

/** A department name, trimmed and sanity-checked. */
function cleanName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value) throw new Error("A department needs a name.");
  if (value.length > 60) throw new Error("Keep the name under 60 characters.");
  return value;
}

/**
 * Create a department. Names are unique case-insensitively — "sales" next to
 * "Sales" would be two spellings of one department, not two departments.
 * Admin-only.
 */
export async function createDepartment(name: string) {
  await requireAdmin();
  const value = cleanName(name);

  const clash = await prisma.department.findFirst({
    where: { name: { equals: value, mode: "insensitive" } },
    select: { name: true },
  });
  if (clash) throw new Error(`"${clash.name}" already exists.`);

  await prisma.department.create({ data: { name: value } });
  revalidateStructure();
}

/** Rename a department. Everyone in it keeps their membership. Admin-only. */
export async function renameDepartment(departmentId: string, name: string) {
  await requireAdmin();
  const value = cleanName(name);

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!dept) throw new Error("Department not found");
  if (dept.name === value) return;

  const clash = await prisma.department.findFirst({
    where: {
      name: { equals: value, mode: "insensitive" },
      id: { not: departmentId },
    },
    select: { name: true },
  });
  if (clash) throw new Error(`"${clash.name}" already exists.`);

  await prisma.department.update({
    where: { id: departmentId },
    data: { name: value },
  });
  revalidateStructure();
}

/**
 * Delete a department. Its people keep their accounts and roles but end up
 * with no department (the FK is SET NULL) — they'll show under "No department"
 * here until they're placed somewhere. Admin-only.
 */
export async function deleteDepartment(departmentId: string) {
  await requireAdmin();
  await prisma.department.delete({ where: { id: departmentId } });
  revalidateStructure();
}

/**
 * Move a person to a department (or out of every department with null).
 * Their role rides along — moving a lead makes them that department's lead.
 * Admin-only.
 */
export async function setUserDepartment(
  userId: string,
  departmentId: string | null,
) {
  await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, departmentId: true },
  });
  if (!user) throw new Error("User not found");

  let deptName: string | null = null;
  if (departmentId != null) {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    });
    if (!dept) throw new Error("Department not found");
    deptName = dept.name;
  }
  if (user.departmentId === departmentId) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { departmentId } });
    await notify(
      tx,
      userId,
      "OTHER",
      deptName
        ? `You were moved to the ${deptName} department.`
        : "You were taken out of your department — an admin will place you in one.",
    );
  });
  revalidateStructure();
}

/**
 * Set a person's role label. LEAD = expected at Monday meetings and expected
 * to submit weekly/monthly goals (the fine sweep and admin flags follow this
 * immediately); MEMBER = no such expectations, and any untouched
 * late-submission fine they carry is released on the next sweep. Admin-only.
 */
export async function setUserRole(userId: string, role: TeamRole) {
  await requireAdmin();
  if (role !== "LEAD" && role !== "MEMBER") throw new Error("Invalid role");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) throw new Error("User not found");
  if (user.role === role) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role } });
    await notify(
      tx,
      userId,
      "OTHER",
      role === "LEAD"
        ? "You're now a department lead — Monday meetings and weekly/monthly goal submissions are expected of you."
        : "Your role is now member — no meeting or weekly-submission expectations apply to you.",
    );
  });
  revalidateStructure();
}
