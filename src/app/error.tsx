"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Root error boundary — a quiet "try again" card instead of the framework's
 * bare default when a page crashes. (This file does not wrap the root layout;
 * for errors there, Next falls back to its own global handler.)
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-fg">
          The page failed to load. Trying again usually fixes it.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-fg transition hover:bg-canvas"
          >
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
