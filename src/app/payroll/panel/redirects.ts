// Where /payroll/review, /payroll/finance and /payroll/sheet now point.
//
// One function so the three of them cannot drift on the thing that matters:
// carrying the selected month across. Losing it would silently move a reader
// from the month they bookmarked to the current one — the quietest kind of
// wrong answer a redirect can give.

import type { NextRequest } from "next/server";

export type PanelView = "queue" | "sheet";

export function panelUrl(req: NextRequest, view: PanelView): URL {
  const url = new URL("/payroll/panel", req.nextUrl.origin);
  const p = req.nextUrl.searchParams.get("p");
  if (p) url.searchParams.set("p", p);
  // The queue is the default view, so it is left out of the URL entirely.
  if (view === "sheet") url.searchParams.set("view", "sheet");
  return url;
}
