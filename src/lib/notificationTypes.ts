// Client-safe mirror of the Prisma `NotificationType` enum, so components can
// type notification views without importing the generated server client.
// (Same pattern as lib/penalties.ts mirroring PenaltyType.)

export type NotificationType =
  | "FINE"
  | "BONUS"
  | "TASK_ASSIGNED"
  | "REPORT"
  | "OTHER";

// Dot color per type, shared by the bell dropdown and the notifications page:
// red fine, green bonus, amber task (matches the "Assigned to you" card),
// navy report.
export const NOTIFICATION_DOT: Record<NotificationType, string> = {
  FINE: "bg-red-500",
  BONUS: "bg-green-500",
  TASK_ASSIGNED: "bg-amber-500",
  REPORT: "bg-brand",
  OTHER: "bg-line",
};
