"use client";

import { useEffect, useState } from "react";

// Days matter here: the window is the rest of the filing window, not a fixed
// 24 hours (see resubmitWindowFor), so a decline on the day filing opens can
// leave four figures of minutes. "3d 4h" reads; "84h 12m" doesn't. Minutes are
// dropped once there are days left — nobody paces a three-day deadline by them.
function remaining(deadlineMs: number): string | null {
  const left = deadlineMs - Date.now();
  if (left <= 0) return null;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.ceil((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * The ticking half of a decline notice: how long is left to fix and resend.
 * The absolute deadline arrives pre-formatted in Tashkent time (the server
 * knows the company clock); this only counts down to the same instant, and
 * makes no assumption about how far away it is — a decline usually leaves the
 * rest of the filing window, which can be days.
 */
export function ResubmitCountdown({
  deadlineIso,
  deadlineLabel,
}: {
  deadlineIso: string;
  deadlineLabel: string;
}) {
  const deadlineMs = new Date(deadlineIso).getTime();
  const [left, setLeft] = useState(() => remaining(deadlineMs));

  useEffect(() => {
    const timer = setInterval(() => setLeft(remaining(deadlineMs)), 30_000);
    return () => clearInterval(timer);
  }, [deadlineMs]);

  return (
    <p className="text-xs text-red-700">
      Resubmit by <span className="font-semibold">{deadlineLabel}</span>
      {left ? (
        <>
          {" "}
          — <span className="font-semibold tabular-nums">{left}</span> left.
        </>
      ) : (
        <> — the window has closed; reload to see where this stands.</>
      )}
    </p>
  );
}
