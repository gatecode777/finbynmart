# Page 24 — Address security report

Findings are from the tests in `docs/page-reports/tools/24-buyer-addresses-test.mjs` (run against a production build on the throwaway database). Not run: penetration testing, an external scanner.

| Control | Result |
|---|---|
| Authentication | Every route 401 without a session (private, `no-store`); supplier account 403; suspended buyer's session rejected |
| Page redirect | Signed-out visit redirects to sign-in and returns to `/buyer/addresses` |
| IDOR | Another buyer's id on read, update, delete and set-default is 404, identical to an unknown or malformed id; the address is unchanged afterwards |
| Identity from the session | `buyerId` in a body is refused (400); `buyerId`/`userId` in the query is ignored |
| Mass assignment | `companyId`, timestamps, `deletedAt`, `normalizedPhone`, `role`, `ownerUserId`, `id` refused (400) |
| Company link | Server derives the buyer's own company; a client `companyId` is refused; linking without a company is `NO_COMPANY` |
| Injection | Operator objects in text fields refused; search text is escaped and taken literally (`.*` and `([` return no match, no error); `q` over 60 characters refused |
| Concurrency | Stale updates 409; simultaneous saves: one 200, one 409; parallel defaults leave one default (database-enforced) |
| Abuse | 60 writes / 10 minutes / buyer, the 61st gets 429; 50-address cap (409 `LIMIT`) |
| Data minimisation | DTO has no buyer id, object id or company id; audit events hold field names only |
| Cache | `Cache-Control: no-store` on every address route (private data) |

## Open items
- No rate limit on reads (they are bounded to 50 rows and indexed).
- No CSRF token beyond the same-site session cookie (project-wide; see `docs/audit/11_SECURITY_AUDIT.md`).
- Roles beyond buyer/supplier are not enforced anywhere yet.
