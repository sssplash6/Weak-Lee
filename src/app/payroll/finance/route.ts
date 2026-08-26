// The finance stage used to be its own panel. It is now the queue view of
// /payroll/panel: the same rows, with finance's confirm/send-back offered on
// exactly the rows awaiting payment when the viewer is finance.
//
// One thing genuinely changed in the merge and is worth knowing: this page
// listed approved requests across ALL periods at once, and the panel is scoped
// to a month. Requests approved in an earlier month are therefore named in the
// panel's "also awaiting payment in …" line rather than mixed into the list.
//
// See ../review/route.ts for why this is a route handler and a 307. This page
// never took a period, so there is none to carry.

import { NextResponse, type NextRequest } from "next/server";
import { panelUrl } from "../panel/redirects";

export function GET(req: NextRequest) {
  return NextResponse.redirect(panelUrl(req, "queue"), 307);
}
