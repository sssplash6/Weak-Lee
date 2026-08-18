// Client-safe role/membership vocabulary. The TeamRole enum lives in the
// Prisma schema; this mirrors it as a plain union so client components and
// pure libs can use it without importing the generated client.
//
// A role belongs to ONE membership (person × department), not to the person:
// someone can lead their own department and sit as a member of another. "Is a
// lead" as a person-level question — who owes Monday meetings and weekly and
// monthly submissions — means "leads at least one department".

export type TeamRole = "LEAD" | "MEMBER";

/** How a role reads in the UI. The ops director is labelled a dep. lead too. */
export const ROLE_LABEL: Record<TeamRole, string> = {
  LEAD: "Dep. lead",
  MEMBER: "Member",
};

export type MembershipLite = { role: TeamRole };

/** Whether this person leads at least one department — the expectation label. */
export function isLead(memberships: readonly MembershipLite[]): boolean {
  return memberships.some((m) => m.role === "LEAD");
}

type NamedMembership = { role: TeamRole; department: { name: string } };

/**
 * A person's departments as display names, the ones they lead first (marked
 * "(lead)" when they also belong to others, so the hat is visible per seat).
 */
export function departmentNames(
  memberships: readonly NamedMembership[],
): string[] {
  const sorted = [...memberships].sort(
    (a, b) =>
      Number(b.role === "LEAD") - Number(a.role === "LEAD") ||
      a.department.name.localeCompare(b.department.name),
  );
  const multi = sorted.length > 1;
  return sorted.map((m) =>
    m.role === "LEAD" && multi ? `${m.department.name} (lead)` : m.department.name,
  );
}

/** The joined one-line form of departmentNames, or null with no memberships. */
export function departmentLine(
  memberships: readonly NamedMembership[],
): string | null {
  const names = departmentNames(memberships);
  return names.length > 0 ? names.join(" · ") : null;
}
