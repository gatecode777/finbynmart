import { NextResponse } from "next/server";
import { maintenanceHeaders, maintenanceHtml, maintenanceOn, retryAfter } from "@/lib/maintenance";
import { safeReturnPath } from "@/lib/auth/safeReturn";

export const dynamic = "force-dynamic";

/**
 * GET /maintenance (Page 78). A route handler, not a page, so no root layout, header, session or database code runs for it. While maintenance is ON the middleware answers first (HTTP 503); this
 * handler repeats the same answer if it is ever reached. While maintenance is OFF there is nothing to show, so a visit safely moves on (307, never cached) to the homepage, or to `?next=` when that is a
 * validated same-site path (never an external address, never an auth or maintenance loop).
 */
export function GET(request: Request) {
  if (maintenanceOn(process.env.MAINTENANCE_MODE)) return new NextResponse(maintenanceHtml(null), { status: 503, headers: maintenanceHeaders(retryAfter(process.env.MAINTENANCE_RETRY_AFTER_SECONDS), "text/html; charset=utf-8") });
  const next = safeReturnPath(new URL(request.url).searchParams.get("next") ?? undefined) ?? "/";
  return new NextResponse(null, { status: 307, headers: { Location: next, "Cache-Control": "no-store, max-age=0" } });
}
