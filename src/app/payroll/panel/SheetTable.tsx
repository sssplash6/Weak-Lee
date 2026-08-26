"use client";

import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react";
import { formatMoney } from "@/lib/penalties";
// The register's one write stays in ../sheet, beside the authorization it
// enforces; only the table moved here when the three panels merged.
import { setSheetFigures } from "../sheet/actions";
import {
  formatCents,
  formatWhole,
  parseCentsFigure,
  parseWholeFigure,
  sumRecorded,
} from "./figures";

/** The three columns finance records by hand — the only editable ones. */
export type SheetField = "amountUzs" | "amountSgdCents" | "wiseFeeCents";

/**
 * One line of the register. Everything the row displays is computed on the
 * server (dates in the company timezone, the payment-source label, the
 * department line) so this component only has to worry about the three
 * figures it can change and the arithmetic across them.
 */
export type SheetRow = {
  id: string;
  /** "19 Aug" — the Tashkent calendar day the request was filed. */
  dateLabel: string;
  /** The same day as "YYYY-MM-DD", for the CSV: a spreadsheet reads it as a date. */
  dateYmd: string;
  /** The full Tashkent stamp, on hover — two rows can share a day. */
  dateTitle: string;
  name: string;
  deptLine: string | null;
  amountUzs: number | null;
  amountSgdCents: number | null;
  wiseFeeCents: number | null;
  sourceLabel: string;
  baseSalary: number;
  bonusesTotal: number;
  finesTotal: number;
  netTotal: number;
};

/**
 * The columns, in the order the finance team's own monthly tab lists them.
 * One declaration drives both the table head and the CSV header, so the export
 * can never drift out of step with what is on screen.
 */
const COLUMNS: { label: string; numeric?: boolean; width?: string }[] = [
  { label: "Date", width: "w-24" },
  // The identity column carries the most weight, so it gets the most room and
  // is the one the reader keeps in view when the table scrolls sideways.
  { label: "Item", width: "w-56" },
  { label: "Amount (UZS)", numeric: true, width: "w-36" },
  { label: "Amount (SGD)", numeric: true, width: "w-32" },
  { label: "Source", width: "w-32" },
  { label: "Salary (USD)", numeric: true, width: "w-24" },
  { label: "Bonus (USD)", numeric: true, width: "w-24" },
  { label: "Penalty (USD)", numeric: true, width: "w-24" },
  { label: "Wise Fee", numeric: true, width: "w-28" },
  { label: "Final Amount", numeric: true, width: "w-28" },
];

/** Placeholder for a figure finance hasn't recorded. Never a 0 — see the schema. */
const BLANK = "—";

const cellKey = (rowId: string, field: SheetField) => `${rowId}:${field}`;

/** Which of the two units a field is stored in. Drives parsing and display. */
const IS_CENTS: Record<SheetField, boolean> = {
  amountUzs: false,
  amountSgdCents: true,
  wiseFeeCents: true,
};

/** A stored integer as it should read on screen, in that field's own unit. */
function displayFigure(
  value: number | null,
  field: SheetField,
  grouped = true,
): string {
  if (value === null) return grouped ? BLANK : "";
  return IS_CENTS[field]
    ? formatCents(value, grouped)
    : formatWhole(value, grouped);
}

/** One CSV field, quoted only when it has to be. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The register for one month: one row per filed request, the three payout
 * figures editable in place, and a totals row — the column sums are the whole
 * point of a register.
 *
 * Rendered twice on purpose. Ten columns cannot be squeezed into a phone, and
 * forcing a 72rem table through a 20rem viewport means dragging sideways
 * through every field of every row (the same call /team makes), so phones get
 * one card per person and the table appears at `lg`, where it only has a few
 * rem of scroll left in it and the Item column stays on screen throughout.
 */
export function SheetTable({
  rows,
  editable,
  periodKey,
}: {
  rows: SheetRow[];
  /** False for a reviewer who may look but not record — the action agrees. */
  editable: boolean;
  /** "2026-08" — names the CSV file. */
  periodKey: string;
}) {
  // Values committed here but not yet reflected in the server-rendered props,
  // keyed by cell. Only ever holds what the server has accepted (a refusal
  // puts the previous value back), so it can never disagree with the database
  // except while a save is in flight.
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  const [editing, setEditing] = useState<{
    rowId: string;
    field: SheetField;
  } | null>(null);
  const [draft, setDraft] = useState("");
  // One message per row, shown under it: both the local "that isn't a number"
  // and whatever the action refused with.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  const valueOf = (row: SheetRow, field: SheetField): number | null => {
    const key = cellKey(row.id, field);
    return key in edits ? edits[key] : row[field];
  };

  const setRowError = (rowId: string, message: string | null) =>
    setErrors((prev) => {
      if (message === null) {
        if (!(rowId in prev)) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      }
      return { ...prev, [rowId]: message };
    });

  /**
   * Save one cell. Returns false when the text isn't a number, which keeps the
   * editor open on what was typed instead of throwing it away.
   */
  function commit(row: SheetRow, field: SheetField, text: string): boolean {
    const parsed = IS_CENTS[field]
      ? parseCentsFigure(text)
      : parseWholeFigure(text);
    if (!parsed.ok) {
      setRowError(row.id, parsed.error);
      return false;
    }

    const next = parsed.value === "" ? null : Number(parsed.value);
    const before = valueOf(row, field);
    setRowError(row.id, null);
    if (next === before) return true; // opened a cell, changed nothing

    // `setSheetFigures` writes all three columns on every call, so an omitted
    // field is written as null — i.e. cleared. Send the other two back at
    // their current values or editing one figure would silently wipe its
    // neighbours. Read from the effective values, not the props, so two quick
    // edits on the same row don't undo each other.
    const current: Record<SheetField, number | null> = {
      amountUzs: valueOf(row, "amountUzs"),
      amountSgdCents: valueOf(row, "amountSgdCents"),
      wiseFeeCents: valueOf(row, "wiseFeeCents"),
    };
    current[field] = next;
    // Already integers in the stored unit; the conversion happened in the
    // parse above and must not happen twice.
    const payload = {
      amountUzs: current.amountUzs === null ? null : String(current.amountUzs),
      amountSgdCents:
        current.amountSgdCents === null ? null : String(current.amountSgdCents),
      wiseFeeCents:
        current.wiseFeeCents === null ? null : String(current.wiseFeeCents),
    };

    const key = cellKey(row.id, field);
    setEdits((prev) => ({ ...prev, [key]: next }));
    setSaving((prev) => [...prev, key]);
    startTransition(async () => {
      try {
        const res = await setSheetFigures(row.id, payload);
        if (!res.ok) {
          setEdits((prev) => ({ ...prev, [key]: before }));
          setRowError(row.id, res.error);
        }
      } catch {
        setEdits((prev) => ({ ...prev, [key]: before }));
        setRowError(row.id, "Couldn't save that — try again.");
      } finally {
        setSaving((prev) => prev.filter((k) => k !== key));
      }
    });
    return true;
  }

  function beginEdit(row: SheetRow, field: SheetField) {
    setEditing({ rowId: row.id, field });
    // Seed with the ungrouped number so it can be retyped as-is; a thousands
    // separator in an input is just something to delete first.
    setDraft(displayFigure(valueOf(row, field), field, false));
  }

  function commitEditing(row: SheetRow, field: SheetField) {
    if (commit(row, field, draft)) setEditing(null);
  }

  /** Escape: drop the draft AND the complaint about it — both are abandoned. */
  function cancelEditing(row: SheetRow) {
    setEditing(null);
    setRowError(row.id, null);
  }

  const isEditing = (row: SheetRow, field: SheetField) =>
    editing?.rowId === row.id && editing.field === field;

  // Totals run over the effective values so the register re-adds itself the
  // moment a figure is recorded, without waiting for the server round trip.
  const totals = useMemo(() => {
    // Re-derived rather than calling `valueOf`, which would drag the whole
    // component render into this hook's dependency list.
    const pick = (field: SheetField) =>
      rows.map((r) => {
        const key = cellKey(r.id, field);
        return key in edits ? edits[key] : r[field];
      });
    return {
      uzs: sumRecorded(pick("amountUzs")),
      sgd: sumRecorded(pick("amountSgdCents")),
      fee: sumRecorded(pick("wiseFeeCents")),
      salary: rows.reduce((s, r) => s + r.baseSalary, 0),
      bonus: rows.reduce((s, r) => s + r.bonusesTotal, 0),
      penalty: rows.reduce((s, r) => s + r.finesTotal, 0),
      net: rows.reduce((s, r) => s + r.netTotal, 0),
    };
  }, [rows, edits]);

  /**
   * Hand the month over as a CSV of exactly these columns, so finance can
   * paste it straight into their own tab. Numbers go out unformatted (no
   * grouping commas, no dollar signs) and dates as YYYY-MM-DD, because those
   * are the forms a spreadsheet parses back into numbers and dates rather than
   * text. The totals row is deliberately left out: their sheet computes its
   * own sums, and a stray total inside the pasted block would be counted
   * twice.
   */
  function downloadCsv() {
    const lines = [COLUMNS.map((c) => csvField(c.label)).join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.dateYmd,
          row.deptLine ? `${row.name} (${row.deptLine})` : row.name,
          displayFigure(valueOf(row, "amountUzs"), "amountUzs", false),
          displayFigure(valueOf(row, "amountSgdCents"), "amountSgdCents", false),
          row.sourceLabel,
          String(row.baseSalary),
          String(row.bonusesTotal),
          String(row.finesTotal),
          displayFigure(valueOf(row, "wiseFeeCents"), "wiseFeeCents", false),
          String(row.netTotal),
        ]
          .map(csvField)
          .join(","),
      );
    }
    // A Blob + object URL rather than a data: URL — the register can run to
    // hundreds of rows, and the URL length limit is a real ceiling there.
    const url = URL.createObjectURL(
      new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${periodKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-fg">
          {editable
            ? "Click a UZS, SGD or Wise Fee cell to record what actually moved. Enter saves, Escape cancels."
            : "Recording payout figures is finance's job — these cells are read-only for you."}
        </p>
        <button
          type="button"
          onClick={downloadCsv}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-brand shadow-sm transition hover:bg-canvas"
        >
          Download CSV
        </button>
      </div>

      {/* Phone and small tablet: one card per line item. */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-2xl border border-line bg-surface p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {row.name}
                </p>
                <p className="truncate text-xs text-muted-fg">
                  {[row.deptLine, row.dateLabel, row.sourceLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                {formatMoney(row.netTotal)}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
              <Stat label="Salary" value={formatMoney(row.baseSalary)} />
              <Stat label="Bonus" value={formatMoney(row.bonusesTotal)} />
              <Stat label="Penalty" value={formatMoney(row.finesTotal)} />
            </dl>

            <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
              {(
                [
                  ["amountUzs", "Amount (UZS)"],
                  ["amountSgdCents", "Amount (SGD)"],
                  ["wiseFeeCents", "Wise Fee"],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-muted-fg">{label}</dt>
                  <dd className="w-40 shrink-0">
                    <Figure
                      display={displayFigure(valueOf(row, field), field)}
                      editable={editable}
                      editing={isEditing(row, field)}
                      draft={draft}
                      saving={saving.includes(cellKey(row.id, field))}
                      label={`${label} for ${row.name}`}
                      onBegin={() => beginEdit(row, field)}
                      onDraft={setDraft}
                      onCommit={() => commitEditing(row, field)}
                      onCancel={() => cancelEditing(row)}
                    />
                  </dd>
                </div>
              ))}
            </dl>

            {errors[row.id] && (
              <p className="mt-2 text-xs text-red-600">{errors[row.id]}</p>
            )}
          </li>
        ))}

        <li className="rounded-2xl border border-line bg-canvas p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
            {rows.length} {rows.length === 1 ? "request" : "requests"} · totals
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <Stat label="Amount (UZS)" value={totalText(totals.uzs, false)} />
            <Stat label="Amount (SGD)" value={totalText(totals.sgd, true)} />
            <Stat label="Salary" value={formatMoney(totals.salary)} />
            <Stat label="Bonus" value={formatMoney(totals.bonus)} />
            <Stat label="Penalty" value={formatMoney(totals.penalty)} />
            <Stat label="Wise Fee" value={totalText(totals.fee, true)} />
            <Stat label="Final Amount" value={formatMoney(totals.net)} />
          </dl>
        </li>
      </ul>

      {/* Large screens: the register proper, one row per request. Wider than a
          small laptop, so it scrolls inside this box and never takes the page
          body sideways with it. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm lg:block">
        <table className="w-full min-w-[72rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-3 ${c.width ?? ""} ${
                    c.numeric ? "text-right" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-line/60 transition hover:bg-canvas/60">
                  <td
                    className="whitespace-nowrap px-3 py-2 text-muted-fg"
                    title={row.dateTitle}
                  >
                    {row.dateLabel}
                  </td>
                  {/* The person IS the line item — payroll rows are per-person,
                      one request each, so there is nothing finer to itemise. */}
                  <td className="px-3 py-2">
                    <span className="block truncate font-medium text-ink">
                      {row.name}
                    </span>
                    {row.deptLine && (
                      <span className="block truncate text-xs text-muted-fg">
                        {row.deptLine}
                      </span>
                    )}
                  </td>
                  {(
                    [
                      ["amountUzs", "Amount (UZS)"],
                      ["amountSgdCents", "Amount (SGD)"],
                    ] as const
                  ).map(([field, label]) => (
                    <td key={field} className="px-3 py-2 text-right">
                      <Figure
                        display={displayFigure(valueOf(row, field), field)}
                        editable={editable}
                        editing={isEditing(row, field)}
                        draft={draft}
                        saving={saving.includes(cellKey(row.id, field))}
                        label={`${label} for ${row.name}`}
                        onBegin={() => beginEdit(row, field)}
                        onDraft={setDraft}
                        onCommit={() => commitEditing(row, field)}
                        onCancel={() => cancelEditing(row)}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-muted-fg">
                    {row.sourceLabel}
                  </td>
                  <Money>{formatMoney(row.baseSalary)}</Money>
                  <Money>{formatMoney(row.bonusesTotal)}</Money>
                  <Money>{formatMoney(row.finesTotal)}</Money>
                  <td className="px-3 py-2 text-right">
                    <Figure
                      display={displayFigure(
                        valueOf(row, "wiseFeeCents"),
                        "wiseFeeCents",
                      )}
                      editable={editable}
                      editing={isEditing(row, "wiseFeeCents")}
                      draft={draft}
                      saving={saving.includes(cellKey(row.id, "wiseFeeCents"))}
                      label={`Wise fee for ${row.name}`}
                      onBegin={() => beginEdit(row, "wiseFeeCents")}
                      onDraft={setDraft}
                      onCommit={() => commitEditing(row, "wiseFeeCents")}
                      onCancel={() => cancelEditing(row)}
                    />
                  </td>
                  <Money strong>{formatMoney(row.netTotal)}</Money>
                </tr>
                {errors[row.id] && (
                  <tr className="border-b border-line/60">
                    <td
                      colSpan={COLUMNS.length}
                      className="px-3 pb-2 text-xs text-red-600"
                    >
                      {errors[row.id]}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-canvas/70 text-sm font-semibold text-ink">
              <td className="px-3 py-2.5 text-xs uppercase tracking-wide text-muted-fg">
                Totals
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs font-normal text-muted-fg">
                {rows.length} {rows.length === 1 ? "request" : "requests"}
              </td>
              <Money strong>{totalText(totals.uzs, false)}</Money>
              <Money strong>{totalText(totals.sgd, true)}</Money>
              <td className="px-3 py-2.5" />
              <Money strong>{formatMoney(totals.salary)}</Money>
              <Money strong>{formatMoney(totals.bonus)}</Money>
              <Money strong>{formatMoney(totals.penalty)}</Money>
              <Money strong>{totalText(totals.fee, true)}</Money>
              <Money strong>{formatMoney(totals.net)}</Money>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

/** A column sum that stays an em dash while nothing in it has been recorded. */
function totalText(total: number | null, cents: boolean): string {
  if (total === null) return BLANK;
  return cents ? formatCents(total) : formatWhole(total);
}

/** A right-aligned money cell. Tabular figures so the columns line up. */
function Money({
  children,
  strong,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
        strong ? "font-semibold text-ink" : "text-ink"
      }`}
    >
      {children}
    </td>
  );
}

/** Label over value, for the phone cards. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-fg">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/**
 * One editable figure. Declared at module scope, not inside `SheetTable`: a
 * component defined during render is a new type every render, so React would
 * remount the input on every keystroke and the caret would jump out of it.
 *
 * Read-only viewers get plain text — the action refuses them anyway, and a
 * cell that looks clickable but isn't is worse than one that doesn't.
 */
function Figure({
  display,
  editable,
  editing,
  draft,
  saving,
  label,
  onBegin,
  onDraft,
  onCommit,
  onCancel,
}: {
  display: string;
  editable: boolean;
  editing: boolean;
  draft: string;
  saving: boolean;
  label: string;
  onBegin: () => void;
  onDraft: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  if (!editable) {
    return <span className="tabular-nums text-ink">{display}</span>;
  }

  if (editing) {
    return (
      <input
        // Focus follows the click that opened the cell; without this the
        // person would have to click the same cell twice to type in it.
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        value={draft}
        // `text` rather than `number`: a number input silently swallows a
        // pasted "1,234.56" and its scroll wheel can change a figure nobody
        // meant to touch. `inputMode` still gets phones the numeric keypad.
        type="text"
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => onDraft(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full min-w-24 rounded-md border border-brand bg-surface px-2 py-1 text-right text-sm tabular-nums text-ink focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onBegin}
      aria-label={label}
      aria-busy={saving || undefined}
      className={`w-full rounded-md px-2 py-1 text-right tabular-nums transition hover:bg-brand-soft ${
        saving ? "text-muted-fg" : display === BLANK ? "text-muted-fg" : "text-ink"
      }`}
    >
      {display}
    </button>
  );
}
