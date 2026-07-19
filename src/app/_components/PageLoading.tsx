/**
 * Shared loading skeleton for route-level loading.tsx files: a quiet stack of
 * pulsing blocks roughly matching a page's shape (header, then cards). Calm
 * grey, no spinners — same notebook feel as the real pages.
 */
export function PageLoading({ cards = 3 }: { cards?: number }) {
  return (
    <div
      className="mx-auto w-full max-w-3xl flex-1 animate-pulse px-4 py-8"
      aria-hidden="true"
    >
      <div className="h-3 w-28 rounded bg-line" />
      <div className="mt-2 h-7 w-56 rounded bg-line" />
      <div className="mt-2 h-4 w-72 rounded bg-line/70" />
      <div className="mt-8 flex flex-col gap-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-5">
            <div className="h-4 w-2/3 rounded bg-line" />
            <div className="mt-3 h-3 w-1/3 rounded bg-line/70" />
            <div className="mt-4 h-2.5 w-full rounded-full bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
