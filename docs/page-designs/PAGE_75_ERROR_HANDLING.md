# Page 75 — 500 Error / Global Error

Boundaries: `src/app/error.tsx` and `src/app/global-error.tsx` · Portal: PUBLIC · Tracker ID 75. There is no `/500` route (a demo page would not prove boundary wiring).

## Files
`src/components/error/ErrorFallback.tsx` (shared, presentational), `src/app/error.tsx`, `src/app/global-error.tsx`, static guard `docs/page-reports/tools/82-error-boundary-unit-test.mjs`. Existing nearer boundaries (`products`, `suppliers`, `categories`, `categories/[slug]`, `inquiry/[supplierSlug]`) are unchanged and still win for their routes (their Try again only calls `reset()`, which cannot refetch a failed server render; not changed here).

## Boundary placement
| Boundary | Handles | Layout |
|---|---|---|
| `error.tsx` (root) | Server or client render failure in any page below the root layout without a nearer `error.tsx` | Healthy header, navigation and footer stay; only the message renders (no second header) |
| `global-error.tsx` | Failure of the root layout or the shell it renders | Replaces the document: own `<html>`/`<body>`, own brand header, no app header/footer |
| not-found, redirects, API routes | Untouched: 404, sign-in redirect, forbidden and JSON API errors keep their own behaviour |

## Recovery
- Root: `startTransition(() => { router.refresh(); reset(); })`. `reset()` alone re-renders on the client and cannot recover a failed server render (confirmed by test); the refresh refetches server data. One action per click.
- Global: `reset()` then `window.location.reload()` (a plain GET from one explicit click). Without the reload a failed server-rendered layout never recovered in testing.
- No automatic retry, no storage/session clearing, no form replay. Homepage and support links are plain anchors (full page load): `/` and `/contact-us`.

## Styling independence and privacy
Inline CSS with literal brand colours and a system font stack; the only asset is the local logo (alt text keeps the brand readable if blocked). Shown: label "Unexpected error", heading, message, three actions, the "check its status" note and `Reference: <digest>` only when Next provides it (the same digest is in the server log). Never shown: message, stack, connection strings, account data, invented incident ids, "saved" or "notified" claims, or "500". Focus moves once to the heading on appearance; no live region.
Logging: Next logs the real error server-side (observed). The client logs only the digest, in a try/catch. No new vendor, endpoint or collection.

## Scenarios exercised (production build, `next start` on :3100 with an unreachable database URI so no real data was reachable; temporary fixtures, removed)
| Check | Result |
|---|---|
| A server render failure → root fallback inside healthy layout, HTTP 500 | Passed |
| B client render failure → root fallback, HTTP 200 (client failure after a 200 document) | Passed |
| C root-layout failure → global fallback, own document, no site header, HTTP 500 | Passed |
| D transient server, client and root-layout failures: cause removed, Try Again recovers | Passed (global needed the reload; fixed) |
| E persistent failure, 3 clicks: fallback and actions stay, bounded requests, 0 after idle (both boundaries) | Passed |
| F homepage link from global fallback = full navigation to `/`; support link reaches `/contact-us` 200 | Passed |
| G fake secret marker and a fake connection string: absent from DOM and every text/JSON/JS response (server and layout errors); present only in the server log | Passed |
| H 404 stays 404; `/buyer/dashboard` signed out 307 → `/sign-in?next=%2Fbuyer%2Fdashboard`; `/forbidden` 307; login validation 400 JSON | Passed |
| I API with the database unreachable: `/api/auth/login` returns safe JSON 503 (took about 16 s: existing 8 s driver timeouts); catalogue API 200 | Passed (slow failure noted) |
| J submit then render error then Try Again: exactly 1 POST before and after, server counted 1 | Passed |
| K images, fonts, stylesheets and analytics blocked: global fallback readable, all actions reachable | Passed |
| Responsive 320, 360, 390, 430, 768, 1024, 1280, 1440, landscape 844x390, 640x400 (200 % simulated) for both variants: no overflow or clipping; stacked full-width actions below 600 px, side by side above | Passed |
| Keyboard: Tab order Try Again, Homepage, Support with visible 3 px focus ring (both variants) | Passed |
Screenshots captured and viewed: route 1440, global 390. Others saved but not individually reviewed.

## Not verified
Authenticated buyer, supplier and admin portal failure paths (no test identities; the root boundary applies to them but was not exercised); streamed responses behind a `loading.tsx` (a failure after streaming starts returns 200; only the no-loading cases were observed); screen reader, Firefox, Safari, real devices, contrast tool, Lighthouse; other zoom levels; reduced motion (no animation exists). Existing per-route boundaries were not changed. The fixtures (`src/app/zz-fault`, layout probe, `.fault`) were removed and the layout compared identical to its backup.
