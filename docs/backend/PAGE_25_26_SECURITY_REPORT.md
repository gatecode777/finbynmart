# Pages 25-26 — Security report

Findings come from `docs/page-reports/tools/25-26-settings-notifications-test.mjs` (production build, throwaway database `finbynmart_test`). Not run: penetration testing, an external scanner.

| Control | Result |
|---|---|
| Authentication | All 7 endpoints answer 401 with no session (private `no-store`); supplier accounts 403; a suspended buyer's session stops working; the page redirects to sign-in and returns to the same tab |
| Identity from the session | `buyerId` / `userId` in a query or body is never read (query ignored, body key refused) |
| IDOR | Another buyer's notification id, an unknown id and a malformed id on "mark read" all give the identical 404 and the notification stays unread; another buyer's "mark all" changes nothing of the owner's |
| Mass assignment | Settings accept only `notifications.inquiries`, `notifications.company`, `dashboardRange`, `version`: `buyerId`, `role`, `language`, `currency`, `timezone`, `_id` are refused (400) |
| Required security notices | `notifications.account` cannot be sent or switched off (400); the server creates password-change and sign-out notices regardless of preferences |
| NoSQL injection | Operator objects as values (`{ "$ne": "" }`) and JSON-looking filter values are refused (400); `category[$ne]=x` is not the `category` parameter and is ignored |
| Concurrency | Stale settings version 409; three simultaneous first saves give exactly one 200 and two 409 (unique index); notifications are unique per event (database refuses a duplicate) |
| Rate limits | settings writes 30 / 10 min (31st: 429), notification writes 120 / 10 min (121st: 429), mark-all has its own 300 / 10 min bucket, sign-out-everywhere 5 / 10 min, change password 5 / 10 min |
| Sessions | "Sign out of all other devices" bumps the account's session version: the other session gets 401, this device keeps a fresh cookie (tested with two real logins); password change does the same |
| Safe links | Notification links must be `/buyer/...` or `/account/...` paths: schemes, hosts, `//`, backslashes, `..`, encoded slashes, control characters and other areas are refused when created and again when returned; a stored `https://evil...` link comes back as no link (tested; 15 unit checks) |
| Data minimisation | DTOs carry no buyer id or object id of the buyer; notification text holds only references, supplier names and document types (tested against email, phone, password and token patterns); the audit trail holds setting names only |
| Cache | Every settings and notification response is `private, no-store`; the pages are `force-dynamic` and noindex |
| Honesty | No page text claims email, SMS or WhatsApp delivery; unavailable features are listed with no switch |

## Open items
- No rate limit on the read endpoints (they are indexed and bounded to 50 rows).
- Required-category policy for future events (for example supplier replies) must be decided before they are added.
- Data export, deletion and marketing consent are policy work, not implemented (see the privacy rules).
- No CSRF token beyond the same-site cookie (project-wide; see `docs/audit/11_SECURITY_AUDIT.md`).
