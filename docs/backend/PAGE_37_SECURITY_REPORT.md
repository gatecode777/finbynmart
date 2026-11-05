# Page 37 — Security report

Method: automated tests against `next start` of a production build on `finbynmart_test` (`37-buyer-ticket-details-test.mjs`, 92 checks). No external scanner, penetration test or dependency audit was run.

| Area | Control | Evidence |
|---|---|---|
| Authentication | session on all eight routes and the page; forged cookie and suspended buyer rejected; supplier 403 | A-01–A-04 |
| IDOR / enumeration | ticket found by reference AND session buyer; another buyer's, unknown, malformed references give the identical 404 on every route and the page; ids in the query ignored | B-03–B-06 |
| Cross-ticket access | messages queried by the ticket's id; files by ticket; a file of another ticket or of an internal message 404 | C-02, E-05 |
| Internal notes | `visibility:"internal"` messages, their files and internal events excluded from conversation, timeline, files and download | C-02, E-01, E-05, F-04 |
| Sender spoofing | sender and role from the session; sender/role/visibility/kind/status/ticket/owner/dates/attachments in a body refused 400 | D-05 |
| Status manipulation | buyers set no status; the only transition is reopen (checked against the transition table); PUT/PATCH/DELETE 405; a status in any body 400 | B-07, D-05, H-02 |
| Unauthorized reopen / feedback | another buyer 404; ineligible 409; unique index for feedback | H-03, I-03, I-05 |
| Duplicate / race | unique send key (4 simultaneous sends → 1 message); reopen key + conditional update (4 → 1); unique feedback (3 → 1) | D-07, H-04, I-05 |
| Input validation | message, reason, rating, comment, cursor, page size validated server-side; markup characters refused; operator-style cursor/params rejected or ignored | D-03, C-06, H-02, I-01, F-06 |
| XSS | message text rendered as text; HTML body shows literally, no element created, nothing runs | K-09 |
| File upload | content (magic bytes) and extension checked; random private names; count/size limits; no orphan files; owner-only download with `attachment`, `no-store`, `nosniff` | D-11, D-12, E-03–E-05 |
| Rate limiting | reply 30/h, reopen 5/h, feedback 10/h per buyer (429 + Retry-After) | D-15, H-12, I-08 |
| Response hygiene | allow-listed DTOs, `private, no-store` | A-01, I-09 |
| Honesty | no support-notified claim, no seen/delivered, no fake agent | D-14, K-02 |

Known gaps (not fixed here): no malware scan; no per-ticket message cap; no CSRF token beyond same-site session cookies (as elsewhere); project-wide security headers still open (`docs/audit/11_SECURITY_AUDIT.md`); read routes have no per-route rate limit; the support-inbox e-mail path is untested; there is no support side, so nothing tests an agent session writing messages (they are inserted directly in tests).
