// The admin stage used to be its own panel, then the queue view of
// /payroll/panel. The stage itself is gone — one reviewer decides and pays —
// and this URL survives only for anyone who bookmarked it, landing them on
// the panel where their row now is.
//
// A route handler rather than a `page.tsx` that calls `redirect()`: ../loading
// puts a Suspense boundary around every payroll page, so the shell is already
// on the wire by the time a page component can throw, and Next has to fall
// back to a one-second `<meta http-equiv="refresh">`. A handler answers before
// any of that with a real 307 and no HTML at all.
//
// 307 and not a permanent 308: a 308 is cached by the browser indefinitely,
// and an internal tool should stay free to change its own routing without
// every existing session having memorised the old answer.

import { NextResponse, type NextRequest } from "next/server";
import { panelUrl } from "../panel/redirects";

export function GET(req: NextRequest) {
  // The period is the one piece of state this URL held; the view is left to
  // default, which is the queue.
  return NextResponse.redirect(panelUrl(req, "queue"), 307);
}
