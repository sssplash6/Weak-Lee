import { EditAssignedTask } from "./EditAssignedTask";

export type AssignedByMeItem = {
  id: string;
  title: string;
  recipient: string;
  scope: "WEEKLY" | "MONTHLY";
  deadlineLabel: string | null;
  deadline: string | null; // YYYY-MM-DD, for the edit form
  note: string | null;
  done: boolean;
};

/**
 * The goals the signed-in user has assigned to others, shown beneath their
 * fines. Lets an assigner keep an eye on what they handed out and whether it's
 * been done. Renders nothing when they haven't assigned anything.
 */
export function AssignedByMe({ items }: { items: AssignedByMeItem[] }) {
  if (items.length === 0) return null;

  const pending = items.filter((i) => !i.done).length;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Assigned by you</p>
        {pending > 0 && (
          <span className="text-[11px] font-medium text-muted-fg">
            {pending} pending
          </span>
        )}
      </div>
      <ul className="mt-2 flex flex-col">
        {items.map((t) => (
          <li key={t.id} className="border-t border-line py-2 first:border-t-0">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`min-w-0 text-xs font-medium ${
                  t.done ? "text-muted-fg line-through" : "text-ink"
                }`}
              >
                {t.title}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`text-[11px] font-semibold ${
                    t.done ? "text-green-700" : "text-muted-fg"
                  }`}
                >
                  {t.done ? "Done" : "Pending"}
                </span>
                <EditAssignedTask
                  task={{
                    id: t.id,
                    title: t.title,
                    note: t.note,
                    deadline: t.deadline,
                    scope: t.scope,
                    recipientName: t.recipient,
                  }}
                />
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-fg">
              {t.recipient}
              {t.deadlineLabel ? ` · due ${t.deadlineLabel}` : ""}
              {t.scope === "MONTHLY" ? " · monthly" : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
