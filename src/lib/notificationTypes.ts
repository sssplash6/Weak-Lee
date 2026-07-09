// Client-safe mirror of the Prisma `NotificationType` enum, so components can
// type notification views without importing the generated server client.
// (Same pattern as lib/penalties.ts mirroring PenaltyType.)

export type NotificationType =
  | "FINE"
  | "BONUS"
  | "TASK_ASSIGNED"
  | "REPORT"
  | "OTHER";
