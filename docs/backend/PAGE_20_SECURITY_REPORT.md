# Page 20 security report

| Control | Result | Evidence |
|---|---|---|
| Hash-at-rest tokens, raw token never stored or logged | Pass | H-09, H-42, G-13 |
| All six token states mapped to safe messages; nothing about the account returned | Pass | H-01 to H-07, H-37 |
| Expiry enforced in the query; used/expired/revoked rows retained for reporting | Pass | H-04, H-05, H-19 |
| Single use, atomic with the password write | Pass | H-14, H-19, H-36 (six parallel requests, one winner) |
| Password policy identical to registration; no truncation or trimming | Pass | H-26 to H-33 |
| Existing scrypt implementation reused; hash never returned | Pass | H-11, H-13 |
| Session revocation for the account that reset; other accounts unaffected | Pass | H-17, H-20, H-21, H-22 |
| Role and redirect from the stored account, not the request; no open redirect | Pass | H-10, H-23, H-24 |
| Weak password or mismatch does not burn the link | Pass | H-26 to H-30, F-06 |
| Suspended or deleted account: refused, link not consumed, nothing written | Pass | H-37, H-38 |
| Operator objects, arrays, null, numbers, oversize bodies | Refused (400) | H-34, H-35 |
| Rate limits (reset 20 per 10 min per address; validate 30 per 10 min) | Implemented; the 429 path is covered for the Page 19 endpoints, **not separately exercised for the reset and validate routes** | F-14, F-14b |
| Headers: no-store, no-referrer, noindex | Pass | H-40, H-41 |
| Security event without secrets | Pass | H-15 |
| GET and mail scanners cannot reset or consume | Pass | H-08, H-60, M-11 |
| No password or token in browser storage, success screen or logs | Pass | H-45, H-53, H-42 |

## Not verified or still open

- HTTPS and `secure` cookies (the test server is plain http).
- A failure injected inside the transaction (see `PAGE_20_ATOMIC_RESET_FLOW.md`).
- No "your password was changed" notification email (no provider).
- No audit-log viewer; events are only written.
- Session version means a stolen cookie works until its owner resets the password; there is no per-device session list.
- No third-party review, penetration test, or dependency audit.
