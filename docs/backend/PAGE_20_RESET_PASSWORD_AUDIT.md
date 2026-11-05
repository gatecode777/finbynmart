# Page 20 audit

Verified against the repository on 2026-11-03 (before the changes).

| Item | Finding |
|---|---|
| Token generation (Page 19) | `randomBytes(32)` base64url, 43 characters (`src/lib/auth/tokens.ts`). Compatible: Page 20 reads the same collection. |
| Storage / hash | `auth_tokens`, SHA-256 hex of the token in `tokenHash`; raw token never stored. |
| Expiry | 30 minutes, configurable (`securityConfig.ts`). |
| Existing reset route | Worked but: token states were only valid/invalid; password write and token consumption were two separate writes (a failed password update after consumption left the link burned); no session revocation; no security event; expired and used rows were deleted so "expired"/"used" could not be told apart; the form was in the older layout. |
| Password hashing | scrypt, 16-byte salt, `salt:hash` hex (`password.ts`). Reused unchanged. |
| Password policy | `checkBuyerPassword` (10-128, not blank, not common): shared with registration. |
| Roles | `users.role` buyer or supplier. |
| Sessions | HMAC-signed stateless cookie, 7 days, **no revocation** and no session collection. |
| Login routes | Only `/sign-in`. `/login/buyer` and `/login/supplier` did not exist. |
| MongoDB transactions | Supported by the Atlas deployment (used and tested). |

## Changes made

Token states VALID / INVALID / EXPIRED / ALREADY_USED / REVOKED / ACCOUNT_UNAVAILABLE with rows kept a day past expiry (`purgeAt` TTL index; the legacy `expiresAt` TTL index is dropped); replaced tokens are marked `revokedAt` instead of deleted. One transaction for consume + password + session version + token revocation + security event. Session revocation through a per-user `sessionVersion` carried in the cookie. `security_events` collection. Redirect aliases. New page and form. `Cache-Control: no-store` and `Referrer-Policy: no-referrer` headers on `/reset-password`, `/verify-email`; `private, no-store` on `/api/auth/*`.

## Remaining risks

No audit-log reader or alerting. Sessions are revoked only for the account that reset (as required) and only by version: a cookie is checked against the user's current version on each request (one user lookup, already done before). No email notification of "your password was changed" (no provider). Rate limiter fails open if the database is unreachable.
