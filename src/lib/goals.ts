// Client-safe goal constraints, shared by the add-goal UI and the server
// action (same pattern as lib/priority.ts).

/**
 * Maximum goals per period (week or month) — the product's focus rule
 * ("set up to 5 goals each week"). Applies to goals you add yourself;
 * goals delegated to you by teammates land in the Inbox and don't count.
 */
export const MAX_GOALS = 5;
