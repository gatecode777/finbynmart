import { NextResponse, type NextRequest } from "next/server";
import { isAllowedWhileOn, maintenanceHeaders, maintenanceHtml, maintenanceJson, maintenanceOn, retryAfter } from "@/lib/maintenance";

/**
 * The maintenance gate (Page 78). With MAINTENANCE_MODE off (the default) this does nothing but call next(). With it ON, every matched request is answered HERE, before any page, layout, API handler
 * or database code runs: a self-contained maintenance document with HTTP 503 for pages, safe JSON with 503 for /api/*, no redirect and no bypass of any kind (no cookie, header, query parameter or
 * admin exemption). Only the explicit allowlist in src/lib/maintenance.ts stays reachable; the static framework and brand assets are excluded by the matcher so the document can load its logo.
 * This stops new HTTP requests only: it cannot stop requests already running, an external scheduler's own clock, or any process that does not go through HTTP.
 */
export function middleware(request: NextRequest) {
  if (!maintenanceOn(process.env.MAINTENANCE_MODE)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (isAllowedWhileOn(pathname)) return NextResponse.next();
  const retry = retryAfter(process.env.MAINTENANCE_RETRY_AFTER_SECONDS);
  if (pathname.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD")) {
    return new NextResponse(request.method === "HEAD" ? null : maintenanceJson(), { status: 503, headers: maintenanceHeaders(retry, "application/json; charset=utf-8") });
  }
  const requested = pathname === "/maintenance" ? null : `${pathname}${search}`;
  return new NextResponse(request.method === "HEAD" ? null : maintenanceHtml(requested), { status: 503, headers: maintenanceHeaders(retry, "text/html; charset=utf-8") });
}

// Next.js needs the matcher as a literal here; it is kept identical to MIDDLEWARE_MATCHER in src/lib/maintenance.ts (a unit test compares them).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|images/brand/).*)"] };
