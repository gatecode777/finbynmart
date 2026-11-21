/**
 * Maintenance mode (Page 78): pure, dependency-free helpers shared by `src/middleware.ts` (Edge) and the `/maintenance` route. Nothing here reads a database, a session or any provider, so the
 * maintenance answer can be produced when the rest of the application cannot.
 *
 * Configuration: the server environment variable MAINTENANCE_MODE, OFF by default. Only these values (case-insensitive, trimmed) turn it ON: `true`, `1`, `on`, `yes`. Anything else, including an unset
 * value, an empty value and a typo, is OFF. It is read per request from the server environment (no client toggle, no cookie, no query parameter, no endpoint can change it); a change needs a restart
 * (self-hosted) or a redeploy (Vercel) and, with several instances, each instance switches when it restarts, so there is a window in which instances disagree.
 * MAINTENANCE_RETRY_AFTER_SECONDS (optional, an integer from 1 to 86400) adds a Retry-After header; without a valid value none is sent. It is a hint, never a promised restoration time.
 */
import { safeReturnPath } from "@/lib/auth/safeReturn";

export const MAINTENANCE_MESSAGE = "Finbyn Mart is temporarily unavailable while maintenance is in progress. Please try again later.";
const ON_VALUES = ["true", "1", "on", "yes"];
export const maintenanceOn = (value: string | undefined | null): boolean => typeof value === "string" && ON_VALUES.includes(value.trim().toLowerCase());
export function retryAfter(value: string | undefined | null): string | null {
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= 1 && n <= 86_400 ? String(n) : null;
}

/**
 * The explicit, minimal allowlist of paths that stay reachable while maintenance is ON. Everything else, every page and every other API (including /api/internal/*, /api/auth/*, /admin/*), is blocked.
 *  - /api/health: liveness only (`{ ok: true }`, no database, no data), so uptime monitors and load balancers can still tell the process is up. It does not say the service is available.
 * Static framework and brand assets never reach the gate (the matcher in middleware.ts excludes /_next/static, /_next/image, the icons and /images/brand/). There is no admin or operator bypass.
 */
export const ALLOWED_WHILE_ON = ["/api/health"] as const;
export const isAllowedWhileOn = (pathname: string): boolean => ALLOWED_WHILE_ON.some((p) => pathname === p);

/** The matcher of middleware.ts, kept here so the unit test can check the same string. */
export const MIDDLEWARE_MATCHER = "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|images/brand/).*)";

export function maintenanceHeaders(retry: string | null, contentType: string): Record<string, string> {
  return { "Content-Type": contentType, "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", ...(retry ? { "Retry-After": retry } : {}) };
}
export function maintenanceJson() {
  return JSON.stringify({ ok: false, code: "MAINTENANCE", message: MAINTENANCE_MESSAGE });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The maintenance document: self-contained (inline CSS, system fonts, an inline decorative icon and the local logo only), so it needs no database, session, script, remote font or image.
 * "Check Again" is a plain link that reloads the originally requested address with a GET (a validated same-site path), or the homepage when there is none: it never resubmits anything.
 */
export function maintenanceHtml(requested: string | null): string {
  const target = safeReturnPath(requested ?? undefined) ?? "/";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Temporarily unavailable | Finbyn Mart</title>
<style>
*,*::before,*::after{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:#f3f9f8;color:#183a38;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.5}
header{padding:16px 24px;background:#fff;border-bottom:1px solid #dce8e5}header img{display:block;height:40px;width:auto;max-width:100%}
main{flex:1;display:grid;justify-items:center;align-content:center;gap:12px;padding:40px 16px;text-align:center}
.icon{display:inline-flex;align-items:center;justify-content:center;width:112px;height:112px;border-radius:50%;background:#eaf5f3;color:#04534f}
.label{margin:8px 0 0;font-size:.8125rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#183a38}
h1{margin:0;font-family:Impact,"Arial Narrow",sans-serif;font-weight:400;font-size:clamp(2.25rem,1.3rem + 4vw,3.75rem);line-height:1.05;color:#04534f;overflow-wrap:anywhere}
p{margin:0;max-width:36rem;font-size:1.0625rem}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;width:100%;max-width:28rem;margin-top:12px;padding:0 24px;border-radius:8px;background:#fdb304;color:#183a38;font-weight:700;text-decoration:none}
.btn:hover{background:#eaa300}.btn:focus-visible{outline:3px solid #04534f;outline-offset:3px}
.note{margin-top:8px;padding:12px 16px;border-radius:8px;background:#eaf5f3;font-size:.9375rem}
footer{padding:16px;background:#04534f;color:#fff;text-align:center;font-weight:700}
</style></head><body>
<header><img src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" height="40"></header>
<main>
<span class="icon" aria-hidden="true"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>
<p class="label">Temporarily unavailable</p>
<h1>We’ll be back soon.</h1>
<p>${esc(MAINTENANCE_MESSAGE.replace(" Please try again later.", " Please check again later."))}</p>
<a class="btn" href="${esc(target)}">Check Again</a>
<p class="note">If you recently submitted a request, check its status once the service is available.</p>
</main>
<footer>Finbyn Mart</footer>
</body></html>`;
}
