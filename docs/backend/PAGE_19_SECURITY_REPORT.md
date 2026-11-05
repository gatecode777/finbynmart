# Page 19 security report

What was checked, how, and what was not.

| Control | Result | Evidence |
|---|---|---|
| Cryptographically secure token (256-bit, base64url) | Implemented | `tokens.ts`; every token seen in tests is 43 characters |
| Hash at rest, no raw token stored or logged | Implemented, tested | M-06, G-13 (database dump and server log searched for the raw token) |
| Expiry (30 min) enforced in the query, not only by TTL | Implemented, tested | F-03; M-21 forces expiry in the database and the token is refused |
| Single use, atomic | Implemented, tested | F-10, M-14 |
| Purpose separation | Tested | F-04 |
| Enumeration resistance | Tested | see `PAGE_19_ACCOUNT_ENUMERATION_PROTECTION.md` |
| Rate limits and cooldown (server side) | Tested | F-14, F-14b, G-02, M-20 |
| NoSQL injection in the email field | Tested: objects, arrays, null, numbers all 400, nothing queried | G-09 |
| Request size limit | Tested (1 KB body) | G-10 |
| Host-header poisoning of links | Tested: forged Host ignored, `APP_URL` used | M-27 |
| Open redirect | No redirect parameter is read by the recovery endpoints; `?next=` elsewhere goes through `safeNext` (unit tested earlier) | G-11 |
| Private caching | `Cache-Control: private, no-store` on recovery answers | G-08 |
| Secrets in email and responses | No password, hash or role | G-05, G-06 |
| Referrer leakage of the link | `Referrer-Policy: no-referrer` and `noindex` on the reset and confirmation pages | P-10 |
| Minimal projection lookup | `findRecoveryAccount` projects `name, email, accountStatus` | code review |
| Weak new password refused without burning the link | Tested | F-05, F-06 |
| Suspended account: no email, no session | Tested | F-15, A-24 |

## Not verified or not present

- ~~Existing sessions survive a password reset~~ **Closed by Page 20:** a reset bumps `users.sessionVersion` and cookies issued earlier are refused (tested H-20). Still no per-device session list.
- No CAPTCHA or bot challenge; abuse control is the rate limits.
- No audit log of reset requests (token documents carry a truncated address hash and timestamps only).
- Fixed-window limiter fails open when the database is unreachable.
- No penetration test, dependency audit or external review was run. Email-provider TLS, SPF/DKIM and deliverability are untested because no provider is configured.
