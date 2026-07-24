"use client";

import { useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
];

/** Read the theme the pre-paint script already applied to <html>. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Light/dark segmented toggle. Flips the `data-theme` attribute on <html>
 * (every color token is overridden under [data-theme="dark"], so the whole
 * app follows) and persists the choice to localStorage. Initial state is read
 * from the DOM, which the root-layout inline script sets before first paint —
 * so there is no flash and no hydration mismatch.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  function apply(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the in-page switch still works.
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-lg border border-line p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => apply(o.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-brand text-white"
                : "text-muted-fg hover:text-ink"
            }`}
          >
            <span aria-hidden="true">{o.icon}</span>
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
