"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/penalties";
import {
  PAYROLL_METHODS,
  PAYROLL_METHOD_LABEL,
  type PayrollMethod,
  type PayrollStatus,
} from "@/lib/payrollTypes";

/**
 * One request as the board sees it: a pre-rendered row plus the handful of
 * facts the board needs to find, count and order it. `node` is the finished
 * server-rendered row (detail and all) handed through untouched — the board
 * decides which rows appear, never what a row says, so the page keeps sole
 * control of which moves a row offers and to whom.
 */
export type PanelBoardItem = {
  id: string;
  node: ReactNode;
  name: string;
  departments: string[];
  status: PayrollStatus;
  statusLabel: string;
  method: PayrollMethod;
  net: number;
  /**
   * When this landed on this desk, as epoch ms — filed, for the admin stage;
   * approved, for finance. Null when nothing is waiting (an already-paid row),
   * which sorts to the back of "longest waiting".
   */
  waitingSince: number | null;
  periodKey: string; // "2026-08" — sortable, and the pill's identity
  periodLabel: string; // "August 2026"
};

type SortKey = "default" | "waited" | "amount" | "name";

const SORT_KEYS: SortKey[] = ["default", "waited", "amount", "name"];

const SORT_LABEL: Record<SortKey, string> = {
  // "default" is the order the server handed the rows over, which means
  // "what needs a decision first".
  default: "Needs action first",
  waited: "Longest waiting",
  amount: "Largest amount",
  name: "Name A–Z",
};

/** Which filter a count is being computed for, so it can exclude itself. */
type Facet = "status" | "period" | "dept" | "method";

type Row = { item: PanelBoardItem; index: number; haystack: string };

/**
 * The working surface of the reviewer panel: search, faceted filters, a
 * payment source breakdown and sorting over rows that are already on the page.
 *
 * Everything here is client-side on purpose. The page already loads the whole
 * month it covers, so narrowing it is a re-render rather than a round trip,
 * and a month of payroll can be worked through without the page ever reloading
 * under the reviewer.
 *
 * The facets configure themselves from the rows: a filter row only appears
 * when there is more than one value to choose between, so a month with five
 * statuses in it grows status pills and a single-status list quietly doesn't,
 * without the page asking for either.
 */
export function PanelBoard({
  items,
  searchPlaceholder = "Search name, department or source…",
  sourceNote,
  emptyHint,
}: {
  items: PanelBoardItem[];
  searchPlaceholder?: string;
  /** One line under the source grid — why the split matters at this stage. */
  sourceNote?: string;
  /** What to say when the filters match nothing. */
  emptyHint: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PayrollStatus | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [method, setMethod] = useState<PayrollMethod | null>(null);
  const [sort, setSort] = useState<SortKey>("default");

  // One lowercase haystack per row, built once. Searching the source and the
  // month as well as the person means "wise" or "july" narrows the list too,
  // which is how a reviewer actually thinks about a batch.
  const rows: Row[] = useMemo(
    () =>
      items.map((item, index) => ({
        item,
        index,
        haystack: [
          item.name,
          ...item.departments,
          PAYROLL_METHOD_LABEL[item.method],
          item.periodLabel,
          item.statusLabel,
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [items],
  );

  // Facet values, in the order the server sent them (statuses already arrive
  // most-urgent-first) or newest-first for months.
  const statuses = useMemo(() => {
    const seen = new Map<PayrollStatus, string>();
    for (const i of items) if (!seen.has(i.status)) seen.set(i.status, i.statusLabel);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [items]);

  const periods = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) if (!seen.has(i.periodKey)) seen.set(i.periodKey, i.periodLabel);
    return [...seen.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([value, label]) => ({ value, label }));
  }, [items]);

  const depts = useMemo(() => {
    const seen = new Set<string>();
    for (const i of items) for (const d of i.departments) seen.add(d);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const q = query.trim().toLowerCase();

  // A row passes when every active filter accepts it. `except` lets a facet
  // count itself out, so each pill reads "what you'd get if you picked this"
  // rather than "what you'd get if you picked this on top of itself" — which
  // would show every unselected pill at zero.
  const passes = (r: Row, except: Facet | null) =>
    (!q || r.haystack.includes(q)) &&
    (except === "status" || !status || r.item.status === status) &&
    (except === "period" || !period || r.item.periodKey === period) &&
    (except === "dept" || !dept || r.item.departments.includes(dept)) &&
    (except === "method" || !method || r.item.method === method);

  const countFor = (facet: Facet, match: (r: Row) => boolean) =>
    rows.filter((r) => passes(r, facet) && match(r)).length;

  // The source split: how much money each payment method accounts for in the
  // current view. Finance pays out per source and reconciles against the
  // "Source" column of the accounting sheet, so this is the run sheet — and
  // each card doubles as the filter for its own source.
  // Not memoized: a panel holds a month of requests at most, so both passes
  // are a few hundred comparisons — cheaper than the dependency list it would
  // take to memoize a closure over five filters correctly.
  const sources = PAYROLL_METHODS.map((m) => {
    const matching = rows.filter((r) => passes(r, "method") && r.item.method === m);
    return {
      method: m,
      count: matching.length,
      total: matching.reduce((s, r) => s + r.item.net, 0),
    };
  }).filter((s) => s.count > 0 || s.method === method);

  const sourceMax = Math.max(1, ...sources.map((s) => s.total));

  const visible = rows
    .filter((r) => passes(r, null))
    .sort((a, b) => {
      // Every comparator falls back to the server's order, so equal rows never
      // shuffle between renders.
      if (sort === "amount") return b.item.net - a.item.net || a.index - b.index;
      if (sort === "name") {
        return a.item.name.localeCompare(b.item.name) || a.index - b.index;
      }
      if (sort === "waited") {
        // Oldest arrival first; rows that aren't waiting on anyone go last.
        const av = a.item.waitingSince ?? Number.POSITIVE_INFINITY;
        const bv = b.item.waitingSince ?? Number.POSITIVE_INFINITY;
        return av - bv || a.index - b.index;
      }
      return a.index - b.index;
    });

  const shownTotal = visible.reduce((s, r) => s + r.item.net, 0);
  const narrowed =
    q !== "" || status !== null || period !== null || dept !== null || method !== null;

  function clearFilters() {
    setQuery("");
    setStatus(null);
    setPeriod(null);
    setDept(null);
    setMethod(null);
  }

  const pillClass = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition ${
      active
        ? "border-brand bg-brand-soft text-brand"
        : "border-line text-muted-fg hover:text-ink"
    }`;

  const withCount = (label: string, n: number) => (n > 0 ? `${label} · ${n}` : label);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="min-w-0 flex-1 basis-56 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort requests"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
        >
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
        {narrowed && (
          <button
            type="button"
            onClick={clearFilters}
            className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted-fg transition hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      {statuses.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStatus(null)} className={pillClass(!status)}>
            All statuses
          </button>
          {statuses.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(status === s.value ? null : s.value)}
              aria-pressed={status === s.value}
              className={pillClass(status === s.value)}
            >
              {withCount(s.label, countFor("status", (r) => r.item.status === s.value))}
            </button>
          ))}
        </div>
      )}

      {periods.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPeriod(null)} className={pillClass(!period)}>
            All months
          </button>
          {periods.map((x) => (
            <button
              key={x.value}
              type="button"
              onClick={() => setPeriod(period === x.value ? null : x.value)}
              aria-pressed={period === x.value}
              className={pillClass(period === x.value)}
            >
              {withCount(x.label, countFor("period", (r) => r.item.periodKey === x.value))}
            </button>
          ))}
        </div>
      )}

      {depts.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDept(null)} className={pillClass(!dept)}>
            All departments
          </button>
          {depts.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDept(dept === d ? null : d)}
              aria-pressed={dept === d}
              className={pillClass(dept === d)}
            >
              {withCount(d, countFor("dept", (r) => r.item.departments.includes(d)))}
            </button>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
            <h3 className="text-xs font-semibold text-ink">By payment source</h3>
            {sourceNote && <p className="text-[11px] text-muted-fg">{sourceNote}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sources.map((s) => {
              const active = method === s.method;
              return (
                <button
                  key={s.method}
                  type="button"
                  onClick={() => setMethod(active ? null : s.method)}
                  aria-pressed={active}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:bg-canvas"
                  }`}
                >
                  <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
                    {PAYROLL_METHOD_LABEL[s.method]}
                  </span>
                  <span className="mt-0.5 block text-sm font-bold tabular-nums text-ink">
                    {formatMoney(s.total)}
                  </span>
                  {/* Share of the largest source, so the grid reads as a
                      breakdown at a glance rather than eight equal cards. */}
                  <span
                    className="mt-1.5 block h-1 overflow-hidden rounded-full bg-line"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.round((s.total / sourceMax) * 100)}%` }}
                    />
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-fg">
                    {s.count} {s.count === 1 ? "request" : "requests"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="mb-2 px-1 text-xs text-muted-fg">
        Showing{" "}
        <span className="font-semibold text-ink">
          {visible.length} of {items.length}
        </span>{" "}
        · {formatMoney(shownTotal)} in view
      </p>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center">
          <p className="text-sm font-semibold text-ink">Nothing here</p>
          <p className="mt-1 text-xs text-muted-fg">{emptyHint}</p>
          {narrowed && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-brand transition hover:bg-canvas"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((r) => (
            <Fragment key={r.item.id}>{r.item.node}</Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
