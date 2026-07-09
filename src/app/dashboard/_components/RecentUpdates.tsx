import type { NotificationType } from "@/lib/notificationTypes";

export type UpdateView = {
  id: string;
  type: NotificationType;
  message: string;
  dateLabel: string;
};

// Dot color per notification type: red for fines, green for bonuses, amber for
// assigned tasks (matching the "Assigned to you" card), navy for reports.
const DOT: Record<NotificationType, string> = {
  FINE: "bg-red-500",
  BONUS: "bg-green-500",
  TASK_ASSIGNED: "bg-amber-500",
  REPORT: "bg-brand",
  OTHER: "bg-line",
};

/**
 * The signed-in user's notifications from the last 48 hours — new fines,
 * bonuses, assigned tasks, and (for admins) colleague reports pop up here when
 * they open the dashboard. Renders nothing when the window is empty.
 */
export function RecentUpdates({ updates }: { updates: UpdateView[] }) {
  if (updates.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">Updates</p>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted-fg">
          last 48 hours
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {updates.map((u) => (
          <li key={u.id} className="flex items-baseline gap-2 text-xs">
            <span
              className={`h-1.5 w-1.5 shrink-0 translate-y-px rounded-full ${DOT[u.type]}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 break-words text-ink">
              {u.message}
              <span className="text-muted-fg"> · {u.dateLabel}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
