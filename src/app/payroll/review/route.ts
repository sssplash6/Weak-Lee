// The admin stage used to be its own panel. It is now the queue view of
// /payroll/panel, which shows the same month to both reviewer stages and
// decides a row's verbs from the viewer's role rather than from the URL.
//
// The URL survives for anyone who bookmarked it — and for the
// `revalidatePath("/payroll/review")` calls in ./actions.ts, which still name
// this path.
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
