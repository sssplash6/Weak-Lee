// The small pieces both report cards are built from — a labelled block, a
// label/value row, an empty line, a signed delta and a tone chip. Kept in one
// place so the person card and the department card stay visually identical.

import { Swatch, type Tone } from "./charts";

export type BandTone = "good" | "warn" | "bad";

export const TONE_TEXT: Record<BandTone, string> = {
  good: "text-chart-good",
  warn: "text-chart-warn",
  bad: "text-chart-bad",
};

const TONE_CHIP: Record<BandTone, string> = {
  good: "bg-chart-good/12 text-chart-good",
  warn: "bg-chart-warn/12 text-chart-warn",
  bad: "bg-chart-bad/12 text-chart-bad",
};

export function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-canvas p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-fg">
        {title}
      </h3>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted-fg">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: BandTone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-muted-fg">{label}</dt>
      <dd
        className={`shrink-0 font-semibold tabular-nums ${
          tone ? TONE_TEXT[tone] : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-fg">{children}</p>;
}

/** A tinted status chip — colour plus the word, never colour alone. */
export function ToneChip({
  tone,
  children,
}: {
  tone: BandTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONE_CHIP[tone]}`}
    >
      <Swatch tone={tone as Tone} />
      {children}
    </span>
  );
}

/** A signed delta against a benchmark — direction, not decoration. */
export function Delta({ value, suffix }: { value: number; suffix: string }) {
  const flat = value === 0;
  return (
    <span
      className={`text-[11px] font-semibold tabular-nums ${
        flat ? "text-muted-fg" : value > 0 ? "text-chart-good" : "text-chart-bad"
      }`}
    >
      {flat ? "±0" : `${value > 0 ? "+" : "−"}${Math.abs(value)}`}
      <span className="font-normal text-muted-fg">{suffix}</span>
    </span>
  );
}

/** The dialog chrome both cards share: backdrop, panel, pinned header, scroll. */
export function CardShell({
  label,
  header,
  onClose,
  children,
}: {
  label: string;
  header: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="modal-in my-4 flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-surface shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-line p-5">
          {header}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted-fg transition hover:bg-canvas hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          {children}
        </div>
      </div>
    </div>
  );
}
