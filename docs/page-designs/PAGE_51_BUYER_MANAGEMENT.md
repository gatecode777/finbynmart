# Page 51 — Admin Buyer Management

Route: `/admin/buyers` · Portal: ADMIN · Tracker ID 51. Sidebar entry "Buyers" (`AdminShell`). Anonymous visitors are redirected to `/sign-in?next=` with the name/status/page filters kept; a signed-in non-admin is refused by `requireAdminPage`.

## Files
`src/lib/admin/buyerRules.ts` (client-safe rules), `buyerManagement.ts` (list, detail, status change), `buyerApi.ts` (capability flags), `src/app/api/admin/buyers/route.ts`, `[id]/route.ts`, `[id]/status/route.ts`, `src/app/admin/buyers/page.tsx`, `src/components/admin/AdminBuyersWorkspace.tsx` and `AdminBuyerReview.tsx`. Existing code touched: `permissions.ts` (4 capabilities), `AdminShell.tsx` (nav), and a minimal optional `buyer` filter on the admin inquiry list (`inquiryRules.ts`, `inquiryApi.ts`, `inquiryService.ts`, `AdminInquiriesWorkspace.tsx`). Tests: `84-admin-buyers-unit-test.mjs` (18 checks), `it-admin-buyers.mjs` (integration, BLOCKED), registered in `run-integration-suites.mjs` and `it-preflight.mjs`.

## Buyer eligibility (inclusion rules)
A buyer is a `users` record with `role: "buyer"`: the existing user store, no second identity or auth system. The model has ONE role per account, so there are no multi-role accounts; a person who is also a supplier or admin has a separate account that is never listed, opened or changed here (every query carries `role: "buyer"`; a supplier or admin id gives the same 404 as an unknown id). There is no deleted flag and no test/service-account marker in the model, so none is excluded or special-cased. One row per account, never per inquiry; an inquiry or a name prefix never makes someone a buyer. Status is `accountStatus` (absent = ACTIVE; also PENDING_EMAIL_VERIFICATION, SUSPENDED).

## Reference
No `BUY-xxxx` format existed. The page uses the project's own convention (as `CMP-` for companies): `BUY-` plus the last 8 hex characters of the account id, derived and never stored; the full 24-character id is the only lookup key. Search accepts a name prefix, a full id or a `BUY-` code.

## Permission matrix (checked on the server in page and every endpoint)
| Capability | Grants |
|---|---|
| `buyers.read` | page, list, detail (required by every buyers route) |
| `buyers.contacts` | full e-mail and phone in detail; without it both are masked on the server (`b***@domain`, `********10`) and the full value is never sent |
| `buyers.suspend` | suspend (with `buyers.read`) |
| `buyers.reactivate` | reactivate (with `buyers.read`) |
| `inquiries.read` (existing) | shows the "View Inquiries" link; the destination enforces it again |
Default deny, listed explicitly on the admin account (`docs/admin/ADMIN_ACCESS.md`); no wildcard; no existing admin gains anything automatically.

## API
`GET /api/admin/buyers?q=&status=&page=&limit=` (unknown status/page/limit = 422; 20 per page, max 50; name prefix or reference only; no contact search); `GET /api/admin/buyers/[id]`; `PATCH /api/admin/buyers/[id]/status { action: "suspend"|"reactivate", reason, expectedRev, idempotencyKey }`. Errors `{ ok, message, fields }`; all responses `private, no-store`; list/detail 240 per 10 min, status 30 per 10 min; the actor comes from the session; only those four body fields are read; cross-site writes are 403 before anything else. List rows hold name, reference, status, joined date; the detail adds role, business name as typed (labelled not verified), e-mail confirmed yes/no (never presented as business verification), last sign-in, masked or full contact. Never selected: password hash, tokens, session data, documents. Pagination: skip/limit on `{createdAt -1, _id -1}` plus one `countDocuments` under the same filter; index `buyers_admin_newest (role, createdAt, _id)`; the name prefix is an anchored escaped case-insensitive regex bounded by the buyer count (not index-assisted beyond the role).

## Status action: scope, safeguards, enforcement
Only ACTIVE can be suspended and only SUSPENDED reactivated; a PENDING_EMAIL_VERIFICATION account has no action, so reactivation can never skip e-mail confirmation. Scope: the buyer account only (it has no other role); no supplier or admin account can be targeted. One snapshot transaction: conditional update (role, state, revision `accountRev`) plus the `admin_audit_log` row (action, actor, buyer id, reason, before/after, unique operation key and request hash); if the audit row cannot be written the account is unchanged. A retry with the same key and request answers the original result without a second audit row; the same key with another request, a stale revision, or a changed state is 409. Enforcement already exists and is re-read on every request: `getCurrentUser` returns nothing unless the account is ACTIVE, the sign-in and password-reset routes refuse SUSPENDED, and suspending raises `sessionVersion`, so sessions that were open stay ended after reactivation (the buyer signs in again). Nothing is deleted; inquiries, quotations, orders and saved items are unchanged. The buyer is not notified (no buyer notice exists) and no appeal process exists: both are stated in the confirmation dialog.

## UI
Search and status apply together on Search (Reset restores defaults); only name/reference text, status and page go in the URL; stale responses are ignored; a failed request shows the message with Retry and keeps filters and rows (never an empty list); first-load server failure shows Retry (one automatic client retry on mount); empty states "No buyer accounts yet." and "No buyers match these filters."; table with captions on desktop, cards on mobile; detail drawer (native dialog) with Account overview and Business information ("Not provided" for missing values); the status dialog names the account, lists the real effects, requires a reason (inline error, `aria-invalid`), blocks double submission, shows success only after the server answered ok, and returns focus to the opener. The design board's sample accounts and the "Detail Panel (Reference)" inset are not rendered.

## Related inquiries
"View Inquiries" opens the existing `/admin/inquiries?buyer=<id>` (canonical `inquiries.buyerId`). The inquiry list gained one optional validated `buyer` filter (24 hex, else 422), an inquiries page note with "Show all buyers", and no second table or service. The inquiry page keeps its date range. No conversation text appears on this page.

## Verified
Passed: `tsc`; lint; production build; 18 unit checks; Page 57 tests 71 and 72 still pass; signed-out `GET` list/detail and `PATCH` status = 401 JSON `private, no-store`; cross-site `PATCH` = 403; `/admin/buyers?q=asha&status=SUSPENDED&page=2` = 307 to sign-in with the filters in `next`; no credential field in the HTML. Mocked-API browser checks on a temporary fixture page (removed): 30 checks (populated; Search/Reset/URL; failure + Retry keeping filters; rapid searches ignore the stale response; empty and mount-failure states; detail contents, masked contact, "Not provided", no-verification statements; inquiry link; confirmation effects; reason validation; one PATCH on a double submit with only the four fields; conflict keeps the dialog open and reports not saved; Escape and focus return; permission denied without Retry; 320, 360, 390, 430, 768, 1024, 1280, 1440, landscape, a 200 %-zoom width with no overflow; keyboard focus rings). Screenshots `ab-1280.png`, `ab-390.png` in the session scratch folder.

## Blocked / not verified
`it-admin-buyers.mjs` (eligibility, search, pagination, masking, transaction, audit exactly once, replay, conflicts, concurrency, session-version rise) is written and **not run**: no isolated transaction-capable database. Not run: signed-in admin browser checks (no test identities), HTTP 403 by role and capability, real enforcement of an already-issued session after suspension (code paths asserted statically only), audit-failure atomicity (relies on the transaction; not simulated), Firefox, Safari, devices, screen reader, contrast tool, Lighthouse. Mocked UI checks do not prove authorization or database correctness.

## Open decisions / gaps
Suspending a buyer does not stop suppliers from continuing already-open inquiries, and distribution of an inquiry already submitted is unchanged (no policy exists). No buyer-facing notice or appeal. A buyer-account activity (audit) view is not built (the rows are written with `buyerId` and an index exists). Name search is a bounded scan of buyer accounts, fine at current size; revisit with a text index if buyers grow large.
