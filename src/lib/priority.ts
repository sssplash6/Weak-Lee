// Client-safe priority constants. Mirrors the Prisma `Priority` enum values so
// client components don't need to import the generated client.

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export const PRIORITIES: Priority[] = ["HIGH", "MEDIUM", "LOW"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/** Background color for a priority dot/flag fill. */
export const PRIORITY_BG: Record<Priority, string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-emerald-500",
};

/** Text/stroke color for a priority flag icon. */
export const PRIORITY_TEXT: Record<Priority, string> = {
  HIGH: "text-red-500",
  MEDIUM: "text-amber-500",
  LOW: "text-emerald-500",
};

export function isPriority(value: unknown): value is Priority {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH";
}
