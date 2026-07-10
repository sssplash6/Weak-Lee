import type { PenaltyType } from "@/lib/penalties";

// The penalty ledger's four reasons, in the order the matrix shows them. Each
// carries its own accent so a column reads consistently with the policy card
// it comes from — colorful, but each color means one thing. Shared by the
// server page (aggregation) and the client matrix (chips/dots).
export const REASONS: {
  type: PenaltyType;
  label: string;
  dot: string;
  chip: string;
}[] = [
  {
    type: "MEETING_SKIPPED",
    label: "Skipped meeting",
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-700",
  },
  {
    type: "MEETING_LATE",
    label: "Late to meeting",
    dot: "bg-orange-400",
    chip: "bg-orange-50 text-orange-700",
  },
  {
    type: "LATE_SUBMISSION",
    label: "Late submission",
    dot: "bg-brand",
    chip: "bg-brand-soft text-brand",
  },
  {
    type: "OTHER",
    label: "Other",
    dot: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700",
  },
];
