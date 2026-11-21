# Page 78 — Maintenance

Route: `/maintenance` · Portal: PUBLIC · Tracker ID 78. A deliberate, operator-controlled maintenance mode. **Default OFF; it is OFF in this repository** (`MAINTENANCE_MODE` is not set in `.env.local`; `.env.example` documents `MAINTENANCE_MODE=false`).

## Control
Server env `MAINTENANCE_MODE` (`true`, `1`, `on`, `yes`, any case, trimmed, turn it ON; anything else, including typos, is OFF) and optional `MAINTENANCE_RETRY_AFTER_SECONDS` (integer 1–86400, else no header; a hint, never a promise). Read per request from the server environment. No client toggle, cookie, query parameter or endpoint changes it. A change needs a restart (self-hosted) or redeploy (Vercel); with several instances each switches on its own restart, so there is a window in which they disagree.

## Gate (`src/middleware.ts`, helpers `src/lib/maintenance.ts`)
- OFF: only `NextResponse.next()`.
- ON: answered in the middleware before any page, layout, handler, session or database code: pages 503 HTML (self-contained, inline CSS, local logo, one h1, decorative icon hidden from assistive tech, "Check Again" is a plain GET link to the validated requested path or `/`); `/api/*` and every non-GET/HEAD 503 JSON `{ok:false,code:"MAINTENANCE",message}`; `Cache-Control: no-store`, `X-Robots-Tag: noindex`, optional `Retry-After`. No redirect and no bypass (no admin/operator exemption, header, cookie or query).
- Allowlist: only `/api/health` (liveness `{ok:true}`, no data). Everything else, including `/api/auth/*`, `/api/internal/distribution`, `/admin/*`, is blocked.
- Matcher excludes only `_next/static`, `_next/image`, favicon/icons and `images/brand/` so the document can show its logo. The literal in `middleware.ts` must be inline (Next requirement); `MIDDLEWARE_MATCHER` is kept equal and unit-tested.
- `/maintenance` is a route handler (no layout/session/DB): ON repeats the 503 document; OFF answers 307 (no-store) to `/` or a validated `?next=`.

## Workers, callbacks and limits
The internal distribution endpoint is blocked while ON (its own Bearer secret remains the protection if it is allowed in future). No provider webhooks or callbacks exist in the code. No scheduler was added. The gate stops NEW HTTP requests only: requests already running, MongoDB itself, an external scheduler's own clock and any process outside HTTP are unaffected. Static assets and `/api/health` stay reachable.

## Tests actually run
- `91-maintenance-unit-test.mjs`: 10 checks (flag parsing, Retry-After, allowlist, matcher equality and coverage, document content, Check Again safety, headers/JSON, middleware contract, route handler, workers/callbacks).
- HTTP on one production build served twice (ON with Retry-After 600 on :3100, OFF on :3101; DB unreachable on purpose): ON: `/`, `/products`, `/buyer/dashboard`, `/admin/audit-logs`, `/unauthorized`, `/maintenance`, `/sign-in` 503 HTML; APIs (GET/POST including `/api/auth/login`, `/api/internal/distribution`) 503 JSON; `/api/health` 200; a temporary write handler was hit 0 times while ON; header/cookie/query bypass attempts 503; logo/icon/static CSS 200; HEAD 503. OFF: normal behaviour, `/maintenance` 307 to `/`, `?next=/products` 307 to it, `?next=/sign-in` 307 to `/`; the same build switched by environment only (no rebuild). Temporary fixtures were removed.
- Browser (real Chrome) ON at 320, 360, 390, 430, 768, 1024, 1280, 1440 and landscape 844x390 / 640x360: 503, one h1, no overflow, logo loads, Tab reaches Check Again. Screenshots `docs/page-reports/screenshots/78-maintenance-*.png`.

## Not verified
Vercel/edge behaviour, multi-instance rollout, load balancer health-check configuration, 200% zoom, screen readers, Firefox/Safari/real devices. Maintenance was left OFF; no deployment was made.
