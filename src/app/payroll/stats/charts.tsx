// Server-rendered SVG charts for the payroll stats page. Colors come from the
// theme tokens (they re-step for dark mode in globals.css); marks follow the
// house dataviz method — thin bars with rounded data-ends, a 2px surface gap
// between grouped fills, recessive gridlines, selective direct labels, a
// native <title> tooltip per mark, and a <details> data table as relief for
// the low-contrast light orange.

import { formatMoney } from "@/lib/penalties";

export type MonthPoint = { label: string; value: number };
export type MonthPair = { label: string; a: number; b: number };

const W = 560;
const H = 170;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 18;
const PAD_B = 22;

/** Round up to a friendly 1/2/5 × 10^n ceiling for the y scale. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) {
    if (v <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/** A vertical bar with only its top corners rounded, anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(3, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `H ${x + w - r}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `V ${y + h}`,
    "Z",
  ].join(" ");
}

function Grid({ max, baseline }: { max: number; baseline: number }) {
  const innerH = baseline - PAD_T;
  return (
    <g aria-hidden="true">
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={baseline - innerH * f}
            y2={baseline - innerH * f}
            stroke="var(--color-line)"
            strokeWidth="1"
          />
          <text
            x={PAD_L}
            y={baseline - innerH * f - 3}
            fontSize="9"
            fill="var(--color-muted-fg)"
          >
            {formatMoney(max * f)}
          </text>
        </g>
      ))}
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={baseline}
        y2={baseline}
        stroke="var(--color-line)"
        strokeWidth="1"
      />
    </g>
  );
}

function DataTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] text-muted-fg transition hover:text-ink">
        Data table
      </summary>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} className="py-1 pr-3 font-semibold text-muted-fg">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={`py-1 pr-3 tabular-nums ${j === 0 ? "text-ink" : "text-muted-fg"}`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Single money series over months — the 12-month payroll trend. */
export function ColumnChart({
  points,
  color,
  ariaLabel,
}: {
  points: MonthPoint[];
  color: string;
  ariaLabel: string;
}) {
  const baseline = H - PAD_B;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const innerW = W - PAD_L - PAD_R;
  const step = innerW / points.length;
  const barW = Math.min(34, step * 0.55);
  const peak = points.reduce((m, p, i) => (p.value > points[m].value ? i : m), 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
      >
        <Grid max={max} baseline={baseline} />
        {points.map((p, i) => {
          const h = ((baseline - PAD_T) * p.value) / max;
          const x = PAD_L + step * i + (step - barW) / 2;
          // Direct labels only where they earn it: the peak and the newest bar.
          const labeled = p.value > 0 && (i === peak || i === points.length - 1);
          return (
            <g key={p.label}>
              <path d={barPath(x, baseline - h, barW, h)} fill={color}>
                <title>{`${p.label}: ${formatMoney(p.value)}`}</title>
              </path>
              {labeled && (
                <text
                  x={x + barW / 2}
                  y={baseline - h - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="600"
                  fill="var(--color-ink)"
                >
                  {formatMoney(p.value)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={baseline + 12}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-muted-fg)"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <DataTable
        head={["Month", "Total"]}
        rows={points.map((p) => [p.label, formatMoney(p.value)])}
      />
    </div>
  );
}

/** Two series per month, grouped — bonuses vs fines. */
export function PairColumnChart({
  points,
  aLabel,
  bLabel,
  aColor,
  bColor,
  ariaLabel,
}: {
  points: MonthPair[];
  aLabel: string;
  bLabel: string;
  aColor: string;
  bColor: string;
  ariaLabel: string;
}) {
  const baseline = H - PAD_B;
  const max = niceMax(Math.max(...points.flatMap((p) => [p.a, p.b]), 0));
  const innerW = W - PAD_L - PAD_R;
  const step = innerW / points.length;
  const barW = Math.min(15, step * 0.28);

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-3 px-1">
        {[
          [aLabel, aColor],
          [bLabel, bColor],
        ].map(([label, c]) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-fg">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: c }}
              aria-hidden="true"
            />
            {label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
      >
        <Grid max={max} baseline={baseline} />
        {points.map((p, i) => {
          const center = PAD_L + step * i + step / 2;
          const hA = ((baseline - PAD_T) * p.a) / max;
          const hB = ((baseline - PAD_T) * p.b) / max;
          return (
            <g key={p.label}>
              {/* 2px surface gap between the pair */}
              <path d={barPath(center - barW - 1, baseline - hA, barW, hA)} fill={aColor}>
                <title>{`${p.label} — ${aLabel}: ${formatMoney(p.a)}`}</title>
              </path>
              <path d={barPath(center + 1, baseline - hB, barW, hB)} fill={bColor}>
                <title>{`${p.label} — ${bLabel}: ${formatMoney(p.b)}`}</title>
              </path>
              <text
                x={center}
                y={baseline + 12}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-muted-fg)"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      <DataTable
        head={["Month", aLabel, bLabel]}
        rows={points.map((p) => [p.label, formatMoney(p.a), formatMoney(p.b)])}
      />
    </div>
  );
}

/** Horizontal label · bar · value rows — departments, payment methods. The
 * visible values make each row its own table entry, so no separate relief. */
export function RowBars({
  rows,
  color,
}: {
  rows: { label: string; value: number; valueLabel: string }[];
  color: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-xs">
          <span className="w-32 shrink-0 truncate text-ink" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, background: color }}
              title={`${r.label}: ${r.valueLabel}`}
            />
          </span>
          <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-ink">
            {r.valueLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}
