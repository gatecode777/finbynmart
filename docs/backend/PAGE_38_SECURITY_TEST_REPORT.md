# Page 38 — Security test report

Method: automated tests against `next start` of a production build on `finbynmart_test` (`38-buyer-security-test.mjs`, 99 checks, and `38-security-rules-unit-test.mjs`, 20). No external scanner, penetration test or dependency audit was run.

| Threat | Result | Evidence |
|---|---|---|
| Unauthenticated / supplier / suspended access | 401 / 403 / 401 on every route; page redirects keeping the tab | A-01–A-03, A-08, A-09 |
| Forged and tampered cookie | refused | A-04 |
| Expired cookie | refused | A-05 |
| **Session fixation** (validly signed cookie naming an unregistered session id) | refused | A-06 |
| Revoked session still used | refused on the very next request | C-01 |
| Replay of a logged-out cookie / a cookie from before a password change (rotation) | refused; replaying logout records nothing | E-06, E-07, G-04 |
| IDOR on sessions and alerts | another account's, unknown and malformed ids give the same 404; other buyers' sessions untouched | C-05, D-03, F-08 |
| Token leakage | no sid, hash, cookie, IP, User-Agent, device key or user id in any answer or in the page HTML; only the SHA-256 of the sid is stored; the cookie is invisible to page scripts | B-02, B-06, E-12, R-05 |
| Cookie flags | HttpOnly, SameSite=Lax, Path=/, Secure (production), 7 days | B-01 |
| CSRF | state-changing security routes refuse a foreign Origin and `Sec-Fetch-Site: cross-site` (403), allow the same origin | C-09, C-10 |
| Brute force on password change | 5 attempts per 10 minutes, then 429; rate limits on revoke (20), sign-out-others (5), acknowledge (60) | G-08, D-06 |
| Password reuse / weak / mismatch / wrong current | refused | G-01, G-02 |
| Failed-login flooding of the owner's history | coalesced to one row per 15 minutes; nothing stored for unknown emails | E-02 |
| NoSQL operators in cursors and parameters | refused (400) or ignored | E-10 |
| 2FA bypass | nothing to bypass: no endpoint exists (404), no control shown | H-02, K-03 |
| Role escalation | supplier gets 403 everywhere | A-02 |
| Private caching | private, no-store | A-01, H-01 |

Not tested: `AUTH_REQUIRE_SESSION_REGISTRY=1` (needs a server restart with the switch), the password-reset route's session revocation end to end (no test script exists for the reset flow; covered by code path and manual probe below if run), the support-style email path (none), OTP brute force and recovery-code replay (those features do not exist), TLS/HSTS and security headers (project-wide open item).
Known gaps: no per-route limit on the read routes; no step-up authentication; a session can be revoked by anyone who holds an active session of the account (by design, as for sign-out-everywhere).
