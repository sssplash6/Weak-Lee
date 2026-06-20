import { addGoal } from "../actions";

export function AddGoalCard({ nextIndex }: { nextIndex: number }) {
  return (
    <form
      action={addGoal}
      className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/50 p-5"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold text-muted-fg">
        {nextIndex}
      </span>
      <input
        name="title"
        placeholder={`Add goal ${nextIndex}…`}
        required
        maxLength={120}
        className="flex-1 bg-transparent text-base font-medium text-ink placeholder:text-muted-fg focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark"
      >
        Add
      </button>
    </form>
  );
}
