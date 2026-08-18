// Client-safe role vocabulary. The TeamRole enum lives in the Prisma schema;
// this mirrors it as a plain union so client components and pure libs can use
// it without importing the generated client.

export type TeamRole = "LEAD" | "MEMBER";

/** How a role reads in the UI. The ops director is labelled a dep. lead too. */
export const ROLE_LABEL: Record<TeamRole, string> = {
  LEAD: "Dep. lead",
  MEMBER: "Member",
};

/** Whether this person is expected at meetings and to submit weekly/monthly goals. */
export function isLead(role: TeamRole | null | undefined): boolean {
  return role === "LEAD";
}
