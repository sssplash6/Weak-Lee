// Shared base style for a goal-card control: a compact pill with an icon and a
// short label. Every goal control (subtasks, percent, priority, deadline,
// complete, delegate, delete) uses this so they read as one consistent set;
// colour/accent is layered on per control.
export const CONTROL_PILL =
  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition";
