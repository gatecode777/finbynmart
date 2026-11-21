# Page 50 — Admin Dashboard

Route `/admin/dashboard` (tracker Page 50; the admin portal's landing page; `/admin` only redirects to it, and an administrator lands here after sign-in). Extended in place: the existing launcher kept its route, layout, shell and styling; it now lists every built admin page and shows the work waiting for the signed-in administrator.

## What was wrong
The page listed 8 tools; the sidebar linked 6 more built pages (Buyers, Quotations, Reports, Notifications, Audit logs, Settings) that the start page never offered, and it showed no counts or queues.

## Route and sign-in
- Canonical route `/admin/dashboard`. `/admin` redirects to it (307). `portalHome("admin")` is now `/admin/dashboard`, so the server returns it as the landing path after an administrator signs in.
- **Signed out:** `/admin/dashboard` shows an **Admin sign in** form right on the page (`AdminSignIn`: logo, `SignInForm` with `next=/admin/dashboard`, no buyer or supplier registration links, no shell, no data). A wrong password is an inline error under the password field. After sign-in an administrator lands on the dashboard; a buyer or supplier who signs in through it is sent to their own portal and is then refused at `/admin/dashboard` (`/forbidden`). Other admin pages keep the existing redirect to `/sign-in?next=<page>`.
- The sidebar has a Dashboard entry and the logo links to it.

## What it shows
- **Needs attention** (counts): shown only to an administrator who holds the capability of the queue behind each one, each read from the database at request time (no cache, no estimate) with ONE definition in `src/lib/admin/dashboard.ts`:
  | Card | Capability | Definition | Links to |
  |---|---|---|---|
  | Products awaiting review | `products.review` | supplier products with `draft.review.state = PENDING` (`countPending`, same filter and index as the queue) | `/admin/product-review` |
  | Verifications awaiting review | `verification.read` | latest submission per company in `PENDING_REVIEW` | `/admin/verification` |
  | Support tickets awaiting support | `support.manage` | status OPEN, WAITING_FOR_SUPPORT or REOPENED (not waiting for the buyer, not resolved, not closed) | `/admin/support` |
  | Inquiries needing attention | `inquiries.read` | distribution job FAILED, or PARTIAL with a recorded error (NO_MATCHES is not a failure) | `/admin/inquiries` |
  | Unread notifications | `notifications.read` | the existing per-admin `unreadCount` (yours only) | `/admin/notifications` |
- **Tools**: all 14 built admin pages in the sidebar's order, each shown only if the account holds the capability that opens it (Reports with any `reports.*`; Settings for every administrator). Unbuilt pages (Subscriptions, Payments, Content) are not offered.
- **Failure behaviour**: each count fails alone. A count that cannot be read shows "—" and "Could not be loaded", never zero; the other counts and the tools still render.
- **Not shown, because no source exists**: revenue, payments, subscriptions, trends, rankings, forecasts, any total across portals. The page is read-only (no write, no fetch, no action).

## Files
`src/lib/admin/dashboard.ts` (definitions, `toolsFor`, `DASHBOARD_TOOLS`), `src/app/admin/page.tsx` and `dashboard.module.css`, `countPending` added to `src/lib/admin/productReview.ts`. Test: `99-admin-dashboard-unit-test.mjs`; browser checks `admin-dashboard-check.mjs` (12) and `admin-form-login-check.mjs` (6): signed-out form, inline wrong-password error, administrator lands on the dashboard, `/admin` redirect, buyer is not taken into admin.

## Verification actually run
- Unit 99 (10): every page the sidebar marks built is a tool and has its page file; no unbuilt page offered; capability gating (none -> Settings only; Reports with any report capability; no capability implies another page); count definitions; null-not-zero; no invented metrics; read-only.
- Real run against the THROWAWAY in-memory test database (see `docs/audits/FINBYN_PORTAL_VERIFICATION_REPORT.md`), signed in as a full-access and a restricted administrator, with minimal documents carrying only the counted fields: 11 of 11 checks passed: 14 tools, one h1, no overflow at 1280 and 390; support = 1 (an OPEN ticket; waiting-for-buyer and resolved excluded); inquiries needing attention = 2 (FAILED and PARTIAL with an error; PARTIAL without an error and NO_MATCHES excluded); verifications = 1; products awaiting = 1; unread notifications shown; each card links to its queue; a restricted administrator (`buyers.read` only) sees no counts and only Buyers and Settings; anonymous `/admin` redirects to sign-in with the page kept; no write request and no console error. Screenshots `docs/page-reports/screenshots/50-admin-dashboard-1280.png` and `-390.png`.
- The failure path was seen for real: a count whose collection could not be opened (my first fixture violated a unique index) showed "could not be loaded" on that card only.
- The full authenticated portal sweep (86 page loads, three roles) is clean with the new page.

## Real defects this work exposed (fixed)
`ticketsCollection()` (and the product-review, published-product and inventory index helpers) cached a FAILED index build forever, so one transient failure broke that area until the process restarted; each now clears the cache on failure and retries.

## Not verified
Counts against realistic production volumes (no `explain` run; each count filter is covered by an existing index for products, verification and jobs, the tickets filter is not known to be), the page with real notification events, other widths, accessibility tooling, Firefox/Safari/devices. The fixtures are shaped only for counting; they are not real workflow records.
