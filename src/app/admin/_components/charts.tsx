// Chart primitives for the admin Performance tab. Hand-rolled inline SVG — no
// chart library, and every colour comes from a theme token so light and dark
// both work without per-component variants.
//
// House rules, applied here once so every chart inherits them:
//   • thin marks, 2px-ish gaps in the surface colour separating touching bars
//     (never a stroke around a mark), 1px solid hairline gridlines
//   • one axis, one hue per series; status hues only where the colour *means*
//     good / warning / bad, always beside a written label or count
//   • labels are text tokens, never the mark's colour; values are labelled
//     selectively (extremes and ends) with the rest carried by hover titles
//   • every chart has a text equivalent next to it, so nothing is colour-only

export type Tone = "accent" | "brand" | "good" | "warn" | "bad" | "mute";

const BG: Record<Tone, string> = {
  accent: "bg-accent",
  brand: "bg-brand",
  good: "bg-chart-good",
  warn: "bg-chart-warn",
  bad: "bg-chart-bad",
  mute: "bg-chart-mute",
};

/** A small round key that carries a series' identity beside its label. */
export function Swatch({ tone }: { tone: Tone }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${BG[tone]}`}
      aria-hidden="true"
    />
  );
}

/**
 * A single ratio against 100 — the meter form. The track is a step of the same
 * ramp as the fill, so the whole bar reads as one state.
 */
export function Meter({
  percent,
  tone = "accent",
  height = 6,
  label,
}: {
  percent: number | null;
  tone?: Tone;
  height?: number;
  label?: string;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-line"
      style={{ height }}
      title={label ?? (percent != null ? `${percent}%` : "no data")}
      role="img"
      aria-label={label ?? (percent != null ? `${percent} percent` : "no data")}
    >
      {percent != null && (
        <div
          className={`h-full rounded-full ${BG[tone]}`}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      )}
    </div>
  );
}

/** The score dial — the app's progress-ring language, sized for a card header. */
export function ScoreDial({
  score,
  tone = "accent",
  size = 76,
}: {
  score: number | null;
  tone?: Tone;
  size?: number;
}) {
  const stroke = 6;
  const radius = (size - stroke) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((score ?? 0) / 100) * circumference;
  const strokeClass = {
    accent: "stroke-accent",
    brand: "stroke-brand",
    good: "stroke-chart-good",
    warn: "stroke-chart-warn",
    bad: "stroke-chart-bad",
    mute: "stroke-chart-mute",
  }[tone];

  return (
    <div
      className="relative shrink-0"
      style={{ height: size, width: size }}
      role="img"
      aria-label={score != null ? `Score ${score} out of 100` : "Not scored yet"}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        style={{ height: size, width: size }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-line"
        />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={strokeClass}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold leading-none text-ink">
          {score ?? "—"}
        </span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-fg">
          score
        </span>
      </span>
    </div>
  );
}

/**
 * Columns over time, 0–100. One hue (magnitude, not identity); the highest and
 * the last column are labelled, the rest are carried by hover. Bars are capped
 * so the slot's leftover stays as air, and the surface gap does the separating.
 */
export function TrendColumns({
  points,
  height = 96,
}: {
  points: { label: string; percent: number; note?: string }[];
  height?: number;
}) {
  if (points.length === 0) return null;
  const max = 100;
  const peak = Math.max(...points.map((p) => p.percent));
  const peakAt = points.findIndex((p) => p.percent === peak);
  const plot = height - 18; // room for the x labels under the baseline

  return (
    <div>
      <div
        className="relative flex items-end gap-[2px]"
        style={{ height: plot }}
      >
        {/* Hairline gridlines at 50% and 100% — recessive, behind the marks. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 border-t border-line"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-line"
          style={{ top: plot / 2 }}
          aria-hidden="true"
        />
        {points.map((p, i) => {
          // Label the peak once (its first occurrence) and the latest column;
          // a number on every bar reads as noise.
          const isPeak = p.percent === peak && peakAt === i;
          const isLast = i === points.length - 1;
          return (
            <div
              key={`${p.label}-${i}`}
              className="group relative flex h-full min-w-0 flex-1 items-end"
              title={`${p.label} · ${p.percent}%${p.note ? ` · ${p.note}` : ""}`}
            >
              <div
                className="w-full max-w-6 rounded-t bg-accent"
                style={{ height: `${Math.max((p.percent / max) * 100, 2)}%` }}
              />
              {(isPeak || isLast) && p.percent > 0 && (
                <span className="absolute inset-x-0 -top-0.5 text-center text-[9px] font-semibold tabular-nums text-muted-fg">
                  {p.percent}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] border-t border-line pt-1">
        {points.map((p, i) => (
          <span
            key={`${p.label}-label-${i}`}
            className="min-w-0 flex-1 truncate text-center text-[9px] text-muted-fg"
          >
            {/* Only the ends are labelled when the series is dense. */}
            {points.length <= 6 || i === 0 || i === points.length - 1
              ? p.label
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export type Segment = { label: string; value: number; tone: Tone };

/**
 * Part-to-whole as one horizontal bar, with a legend that carries every
 * segment's name and count — so the split is readable without the colours.
 */
export function StackedBar({
  segments,
  height = 10,
}: {
  segments: Segment[];
  height?: number;
}) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex w-full gap-[2px]" style={{ height }}>
        {shown.map((s, i) => (
          <div
            key={s.label}
            className={`${BG[s.tone]} ${i === 0 ? "rounded-l-full" : ""} ${
              i === shown.length - 1 ? "rounded-r-full" : ""
            }`}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((s) => (
          <li
            key={s.label}
            className="flex items-center gap-1.5 text-[11px] text-muted-fg"
          >
            <Swatch tone={s.tone} />
            <span>{s.label}</span>
            <span className="font-semibold tabular-nums text-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ranked horizontal bars for comparing magnitude across a handful of named
 * things (departments, people). One hue; the value rides at the bar's tip.
 */
export function RankedBars({
  rows,
  suffix = "",
  emphasise,
  compact = false,
}: {
  rows: { key: string; label: string; value: number | null; sub?: string }[];
  suffix?: string;
  /** Row key to highlight; the rest step back to the de-emphasis grey. */
  emphasise?: string | null;
  /** Narrow container (inside a card): shorter label, sub rides with the value. */
  compact?: boolean;
}) {
  const max = Math.max(100, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const dim = emphasise != null && r.key !== emphasise;
        return (
          <li key={r.key} className="flex items-center gap-2.5">
            <span
              className={`${compact ? "w-16" : "w-28"} shrink-0 truncate text-xs text-ink`}
              title={r.label}
            >
              {r.label}
            </span>
            <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
              {r.value != null && (
                <span
                  className={`block h-full rounded-full ${dim ? BG.mute : BG.accent}`}
                  style={{ width: `${Math.max((r.value / max) * 100, 1)}%` }}
                />
              )}
            </span>
            <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
              {r.value != null ? `${r.value}${suffix}` : "—"}
            </span>
            {r.sub && (
              <span
                className={`${
                  compact ? "w-16" : "w-24"
                } shrink-0 truncate text-right text-[11px] text-muted-fg`}
              >
                {r.sub}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Two opposed totals around a shared baseline — money in versus money out.
 * Warm/cool poles, never one hue, so the sign is unmistakable.
 */
export function DivergingPair({
  positive,
  negative,
  positiveLabel,
  negativeLabel,
  format,
}: {
  positive: number;
  negative: number;
  positiveLabel: string;
  negativeLabel: string;
  format: (n: number) => string;
}) {
  const max = Math.max(positive, negative, 1);
  const rows: { label: string; value: number; tone: Tone }[] = [
    { label: positiveLabel, value: positive, tone: "good" },
    { label: negativeLabel, value: negative, tone: "bad" },
  ];
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[11px] text-muted-fg">
            {r.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
            <span
              className={`block h-full rounded-full ${BG[r.tone]}`}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
            {format(r.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { BG as CHART_BG };
