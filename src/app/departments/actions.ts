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
  revalidatePath("/department");
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

/**
 * Flip a department between normal and mini. A mini department's head owes
 * nothing — no Monday meeting, no weekly submission, so no fine — and the
 * first person to join a headless one leads it. Turning a department mini
 * releases its lead's untouched submission fines on the next page load (the
 * sweep in lib/submissionFines.ts does that); turning one back to normal puts
 * its lead back on the hook from the next deadline. Admin-only.
 */
export async function setDepartmentMini(departmentId: string, mini: boolean) {
  await requireAdmin();

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, mini: true, name: true },
  });
  if (!dept) throw new Error("Department not found");
  if (dept.mini === mini) return;

  await prisma.department.update({
    where: { id: departmentId },
    data: { mini },
  });

  const leads = await prisma.departmentMembership.findMany({
    where: { departmentId, role: "LEAD" },
    select: { userId: true },
  });
  if (leads.length > 0) {
    await notify(
      prisma,
      leads.map((l) => l.userId),
      "OTHER",
      mini
        ? `${dept.name} is now a mini department — leading it no longer carries the Monday meeting or the weekly submission deadline.`
        : `${dept.name} is a full department again — leading it now carries the Monday meeting and the weekly submission deadline.`,
    );
  }
  revalidateStructure();
}

/** Rename a department. Every seat in it is untouched. Admin-only. */
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
 * Delete a department. Its memberships go with it (people keep their accounts
 * and their other seats); anyone left with no department at all surfaces under
 * "No department" here until they're placed. Admin-only.
 */
export async function deleteDepartment(departmentId: string) {
  await requireAdmin();
  await prisma.department.delete({ where: { id: departmentId } });
  revalidateStructure();
}

/**
 * Give a person a seat in a department (as a member unless told otherwise).
 * An existing seat is left exactly as it is — adding never demotes a lead.
 * Admin-only.
 */
export async function addMembership(
  userId: string,
  departmentId: string,
  role: TeamRole = "MEMBER",
) {
  await requireAdmin();
  if (role !== "LEAD" && role !== "MEMBER") throw new Error("Invalid role");

  const [user, dept] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    }),
  ]);
  if (!user) throw new Error("User not found");
  if (!dept) throw new Error("Department not found");

  const existing = await prisma.departmentMembership.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
    select: { id: true },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    await tx.departmentMembership.create({
      data: { userId, departmentId, role },
    });
    await notify(
      tx,
      userId,
      "OTHER",
      role === "LEAD"
        ? `You're now the lead of ${dept.name} — Monday meetings and weekly/monthly goal submissions are expected of you.`
        : `You were added to the ${dept.name} department.`,
    );
  });
  revalidateStructure();
}

/** Take a person's seat in one department away. Admin-only. */
export async function removeMembership(userId: string, departmentId: string) {
  await requireAdmin();

  const membership = await prisma.departmentMembership.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
    select: { id: true, department: { select: { name: true } } },
  });
  if (!membership) return;

  await prisma.$transaction(async (tx) => {
    await tx.departmentMembership.delete({ where: { id: membership.id } });
    await notify(
      tx,
      userId,
      "OTHER",
      `You were removed from the ${membership.department.name} department.`,
    );
  });
  revalidateStructure();
}

/**
 * Flip the hat a person wears in ONE department. LEAD anywhere means the
 * Monday meeting and weekly/monthly submissions are expected of them (the fine
 * sweep and admin flags follow on the next page load); losing their last LEAD
 * seat lifts those expectations, and any untouched late-submission fine is
 * released by the next sweep. Admin-only.
 */
export async function setMembershipRole(
  userId: string,
  departmentId: string,
  role: TeamRole,
) {
  await requireAdmin();
  if (role !== "LEAD" && role !== "MEMBER") throw new Error("Invalid role");

  const membership = await prisma.departmentMembership.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
    select: { id: true, role: true, department: { select: { name: true } } },
  });
  if (!membership) throw new Error("They're not in that department");
  if (membership.role === role) return;

  await prisma.$transaction(async (tx) => {
    await tx.departmentMembership.update({
      where: { id: membership.id },
      data: { role },
    });
    await notify(
      tx,
      userId,
      "OTHER",
      role === "LEAD"
        ? `You're now the lead of ${membership.department.name} — Monday meetings and weekly/monthly goal submissions are expected of you.`
        : `You're now a member of ${membership.department.name} (no longer its lead).`,
    );
  });
  revalidateStructure();
}
