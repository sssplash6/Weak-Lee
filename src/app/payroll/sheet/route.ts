// The accounting sheet is now the `?view=sheet` reading of /payroll/panel —
// the same register over the same month's rows the queue shows, so the two can
// no longer disagree about what a month contains.
//
// Both the period and the view are carried across, so a bookmarked month lands
// on that month's register and not on the queue. See ../review/route.ts for
// why this is a route handler and a 307.

import { NextResponse, type NextRequest } from "next/server";
import { panelUrl } from "../panel/redirects";

export function GET(req: NextRequest) {
  return NextResponse.redirect(panelUrl(req, "sheet"), 307);
}
