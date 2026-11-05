# Page 36 — Security report

Method: automated tests against `next start` of a production build on the throwaway database `finbynmart_test` (script `docs/page-reports/tools/36-buyer-support-test.mjs`). No external scanner, penetration test or dependency audit was run.

| Area | Control | Evidence |
|---|---|---|
| Authentication | session on every buyer route and page; forged cookie, suspended buyer rejected | A-01, A-03, A-04, A-05 |
| Authorization | buyer-only (supplier 403); ownership on every read | A-02, D-01–D-04 |
| IDOR | foreign/unknown/malformed references identical 404; attachment ids validated | C-07, D-02, D-04, H-17 |
| Mass assignment | status, priority, agent, owner, reference, events, dates, notes refused | B-04 |
| Input validation | category, subject, description, key, related reference, query parameters validated on the server; markup characters refused | B-03, B-06, F-08 |
| NoSQL injection | search text regex-escaped; operator-style keys ignored; filters whitelisted | F-04, F-08 |
| Rate limiting | ticket creation 10 per buyer per hour, 429 with Retry-After | B-12 |
| Duplicate submission | unique (buyerId, idempotencyKey); four simultaneous submissions → one ticket | B-07, B-08 |
| File upload | content checked (magic bytes), extension must match, count/size limits, random private names, outside `public/`, removed on failure, `attachment` + `nosniff` + `no-store` downloads | C-01–C-08 |
| Privacy of responses | allow-listed DTOs, `private, no-store` | D-06, A-01 |
| Anti-fake | no claim that support was notified; chat never "Online"; no invented contact details | B-01, B-02, G-04, H-11 |

Known gaps (not fixed here): no malware scanning; no CSRF token beyond same-site session cookies (as elsewhere in the project); no security headers work (project-wide open item in `docs/audit/11_SECURITY_AUDIT.md`); the read routes have no per-route rate limit; role enforcement for a future support side does not exist.
