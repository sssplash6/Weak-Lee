type IconProps = { className?: string };

/** A cute little dumpster/trash bin used for all delete actions. */
export function TrashIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* lid + little handle */}
      <path d="M4 7.5h16" />
      <path d="M9.5 7.5l.4-1.4a1 1 0 0 1 .96-.72h2.28a1 1 0 0 1 .96.72l.4 1.4" />
      {/* rounded bin body */}
      <path d="M6 7.5l.7 11a2 2 0 0 0 2 1.9h6.6a2 2 0 0 0 2-1.9l.7-11" />
      {/* smiley-ish ridges */}
      <path d="M10 11.5v5" />
      <path d="M14 11.5v5" />
    </svg>
  );
}

/** A small "send / delegate" icon (paper plane). */
export function ShareIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 4 11 14" />
      <path d="M21 4l-6.5 16a.6.6 0 0 1-1.1.05L11 14 4.5 11.6a.6.6 0 0 1 .05-1.1L21 4Z" />
    </svg>
  );
}
