import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand">
          freshman.academy
        </div>
        <h1 className="mt-1 text-2xl font-bold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-muted-fg">
          That page doesn&rsquo;t exist — probably an old link.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
