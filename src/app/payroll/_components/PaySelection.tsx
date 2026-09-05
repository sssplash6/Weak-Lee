"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Ticking rows to pay them together.
 *
 * The panel's rows are server-rendered and handed to the board as finished
 * nodes, so the tick on a row and the bar that acts on the ticks cannot pass
 * state to each other down the tree — they only share an ancestor. This is
 * that ancestor: the board wraps its list in the provider, a row's tick reads
 * it through `RowTick`, and the batch bar reads it through `usePaySelection`.
 *
 * WHAT MAY BE TICKED IS DECIDED BY THE BOARD, NOT BY A ROW. The provider is
 * given the rows that are both on screen and still awaiting payment, and the
 * selection it hands out is the intersection of the ticks with that set,
 * recomputed every render. So a row that is filtered away, or that has just
 * been paid and come back as a settled row, is not in the batch the bar totals
 * or sends — and the count in the bar visibly changes when it goes. As ever,
 * the server re-checks each request's own status before moving any money; this
 * is only about not asking it to.
 *
 * The ticks themselves are kept raw rather than pruned, so narrowing the
 * filters hides part of a selection instead of destroying it: pay the Wise
 * rows out of a batch, clear the filter, and the rest of the batch is still
 * ticked. Nothing accumulates, because a paid row never becomes selectable
 * again.
 */
export type PayableRow = {
  id: string;
  /** For the batch bar's list — whose payment is about to be confirmed. */
  name: string;
  /** Net payable, so the bar can total the batch without re-querying. */
  net: number;
};

type PaySelection = {
  /** On screen and awaiting payment — everything "select all" would tick. */
  selectable: PayableRow[];
  /** The ticked rows, in the board's own order. */
  selected: PayableRow[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Tick every selectable row, or untick them all when all are ticked. */
  toggleAll: () => void;
  clear: () => void;
};

const PaySelectionContext = createContext<PaySelection | null>(null);

/**
 * The selection, or null when there is no provider above — which is what a row
 * outside a board sees, and why every consumer here renders nothing in that
 * case rather than throwing. A tick that cannot be batched is worse than no
 * tick.
 */
export function usePaySelection(): PaySelection | null {
  return useContext(PaySelectionContext);
}

export function PaySelectionProvider({
  selectable,
  children,
}: {
  selectable: PayableRow[];
  children: ReactNode;
}) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setIds(new Set()), []);

  const value = useMemo<PaySelection>(() => {
    // The batch, derived in the render that draws it: walking `selectable`
    // rather than the ticks is what keeps a hidden or already-settled row out
    // of it, and puts it in the board's order rather than click order.
    const selected = selectable.filter((r) => ids.has(r.id));
    return {
      selectable,
      selected,
      isSelected: (id) => ids.has(id),
      toggle,
      // Only ever touches what is on screen — "select all" over a filtered
      // board means these, and unticking them must not quietly discard ticks
      // the filter is hiding.
      toggleAll: () =>
        setIds((prev) => {
          const next = new Set(prev);
          const ticked = selected.length === selectable.length;
          for (const r of selectable) {
            if (ticked) next.delete(r.id);
            else next.add(r.id);
          }
          return next;
        }),
      clear,
    };
  }, [selectable, ids, toggle, clear]);

  return (
    <PaySelectionContext.Provider value={value}>
      {children}
    </PaySelectionContext.Provider>
  );
}

/** Every tick on a row is this box, spacer included, so the rows line up. */
const TICK_BOX = "flex h-9 w-9 shrink-0 items-center justify-center";

/**
 * The tick on one row. Rendered by the row wrapper that owns the pay verb, so
 * a row can no more tick itself into a batch than it can grow its own Confirm
 * button.
 */
export function RowTick({
  id,
  name,
  disabled,
}: {
  id: string;
  name: string;
  disabled?: boolean;
}) {
  const selection = usePaySelection();
  if (!selection) return null;
  return (
    <span className={TICK_BOX}>
      <input
        type="checkbox"
        checked={selection.isSelected(id)}
        disabled={disabled}
        onChange={() => selection.toggle(id)}
        aria-label={`Select ${name} to pay with others`}
        className="h-4 w-4 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-50"
      />
    </span>
  );
}

/**
 * The same width as a tick, for a row that has none — a settled or declined
 * request sitting between two payable ones. Without it the avatars either side
 * of it would step in and out along the left edge of the list.
 *
 * It appears only while something on the board is tickable, so a month with
 * nothing left to pay is not indented for a column it does not have.
 */
export function RowTickSpacer() {
  const selection = usePaySelection();
  if (!selection || selection.selectable.length === 0) return null;
  return <span className={TICK_BOX} aria-hidden="true" />;
}

/**
 * "Select all" over what is currently on screen. Indeterminate while the
 * selection is a proper subset, which is the one state a checkbox can only be
 * put into from script.
 */
export function SelectAllTick() {
  const selection = usePaySelection();
  if (!selection || selection.selectable.length === 0) return null;

  const some = selection.selected.length > 0;
  const all = selection.selected.length === selection.selectable.length;

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-fg transition hover:text-ink">
      <input
        type="checkbox"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = some && !all;
        }}
        onChange={selection.toggleAll}
        className="h-4 w-4 cursor-pointer accent-brand"
      />
      {all
        ? "Clear selection"
        : `Select all ${selection.selectable.length} awaiting payment`}
    </label>
  );
}
