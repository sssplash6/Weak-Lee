"use client";

import { useState, useTransition } from "react";
import { MAX_DAILY_REPORT } from "@/lib/dailyReportTypes";
import { sendDailyReport } from "../actions";

/**
 * The one report-writing control, shared by the big "today" composer and the
 * inline history editors so sending always looks and behaves the same. Sends
 * on the button or Cmd/Ctrl+Enter; errors render inline (this catches its own
 * rejections, so the global Toaster stays out of it).
 */
export function ReportEditor({
  dayYmd,
  initialContent,
  sendLabel,
  big = false,
  autoFocus = false,
  onSent,
  onCancel,
}: {
  dayYmd: string;
  initialContent: string;
  sendLabel: string;
  big?: boolean;
  autoFocus?: boolean;
  onSent?: () => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = text.trim();
  const unchanged = trimmed === initialContent.trim();
  const disabled = pending || trimmed.length === 0 || unchanged;
  const left = MAX_DAILY_REPORT - text.length;

  function send() {
    if (disabled) return;
    setError(null);
    startTransition(async () => {
      try {
        await sendDailyReport(dayYmd, trimmed);
        onSent?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t send — try again.");
      }
    });
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
        rows={big ? 9 : 5}
        maxLength={MAX_DAILY_REPORT}
        autoFocus={autoFocus}
        placeholder="What did you work on today? Wins, numbers, blockers — a few lines is plenty."
        className={`w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted-fg focus:border-brand focus:outline-none ${
          big ? "min-h-44" : "min-h-24"
        }`}
      />
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs">
          {error ? (
            <span className="font-medium text-chart-bad">{error}</span>
          ) : left < 500 ? (
            <span className="tabular-nums text-muted-fg">{left} left</span>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-fg transition hover:text-ink"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={send}
            disabled={disabled}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Sending…" : sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
