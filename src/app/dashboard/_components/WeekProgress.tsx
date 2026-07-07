export function WeekProgress({
  percent,
  label = "Week",
}: {
  percent: number;
  label?: string;
}) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div
      className="relative h-14 w-14"
      title={`${label} ${percent}% complete`}
      aria-label={`${label} ${percent} percent complete`}
    >
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-line"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-accent transition-[stroke-dashoffset] duration-500 ease-(--ease-in-out-strong)"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-accent">
        {percent}%
      </span>
    </div>
  );
}
