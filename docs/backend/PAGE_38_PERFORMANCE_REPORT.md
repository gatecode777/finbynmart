# Page 38 — Performance report

Measured 2026-11-11 by `docs/page-reports/tools/38-buyer-security-test.mjs` (group P), final run: production build (`.next-audit`, port 3100), throwaway database `finbynmart_test`, caches off, one local Windows machine talking to the hosted MongoDB cluster. One buyer with **20 sessions, 10,000 security events and 2,000 alerts**. Sequential requests, 40 per GET route after a warm-up; 30 acknowledgements; 12 revocations. Not a load test, not production.

| Operation | Target p95 | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Active sessions, 1 / 5 / 20 sessions | < 300 | 111 / 112 / 111 | 119 / 123 / 124 | 123 / 124 / 126 |
| Security overview, 1 / 5 / 20 sessions | < 300 | — | 119 / 125 / 129 | — |
| Security overview, 20 sessions + full history | < 300 | 113 | 164 | 167 |
| Login activity (first page / deep page) | < 350 | 79 / 80 | 95 / 95 | 1,057 / 111 |
| Security events | < 350 | 80 | 97 | 334 |
| Alerts (all / unseen only) | < 350 | 81 / 79 | 91 / 91 | 97 / 94 |
| Recovery methods | < 300 | 80 | 98 | 108 |
| Acknowledge an alert | < 300 | 147 | 159 | — |
| Revoke a session | < 400 | 290 | 312 | — |

Page sizes with the full history stored (20 rows each): sessions 6.3 KB, login activity 4.5 KB, events 5.1 KB, alerts 7.4 KB; ten simultaneous requests succeeded. All targets were met in the final run and in the one earlier complete run (sessions p95 156 / 123 / 144 ms, revoke p95 302 ms there). Single slow requests appeared only at p99 (login activity 1,057 ms, events 334 ms in this run): one outlier each, not reproduced.

## Cost of the registry on every authenticated request
`GET /api/auth/me`, 40 requests each, same run: a cookie **with** a registry session p50 47 / p95 51 ms; a pre-registry cookie (which skips the registry read) p50 47 / p95 51 ms. The session record is read in parallel with the account, so revocation costs no extra round trip. No run of the old code was made, so this is the in-run difference between the two paths, not a before/after. A sign-in now also writes the session record, an event and a device check (and sometimes an alert); sign-in latency is dominated by scrypt (about 300–500 ms in the server log) and was not benchmarked separately against the old code.

## Indexes (explain, 10,000 events / 2,000 alerts / 20 sessions)
| Query | Documents examined |
|---|---:|
| session lookup by id hash (every request) | 1 |
| active session list / count | 19 (the account's non-revoked sessions, at most 20) |
| device known? / failed-sign-in bucket / alert once | 0 |
| login activity (21) | 21 (23 keys) |
| security events (21) | 21 |
| alerts all / unseen (21) | 21 / 21 |
No collection scan and no blocking sort in any of them.

## Not measured
Concurrent load from many buyers, the 21-session eviction path under load, the cost of the new-device check over very long histories (bounded by the 20-session cap and 30-day record retention), Lighthouse/LCP/INP/CLS.
