import Link from "next/link";
import { ArrowLeftIcon } from "@/app/dashboard/_components/icons";

/**
 * Standard "back" button: a bordered pill with a left arrow and navy label.
 * Use this everywhere for back navigation so the style stays consistent.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-brand shadow-sm transition hover:bg-canvas"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {label}
    </Link>
  );
}
