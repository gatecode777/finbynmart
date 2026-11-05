# Reset token specification

Code: `src/lib/auth/tokens.ts`, settings in `src/lib/auth/securityConfig.ts`. Shared by Page 19 (issue) and the reset page (validate and consume). Verified by `docs/page-reports/tools/15-buyer-registration-test.mjs` (M-04 to M-07, M-11 to M-14, F-03 to F-10, G-06, G-07, G-12, G-13).

| Property | Behaviour |
|---|---|
| Generation | `crypto.randomBytes(32)` (256 bits), base64url, always 43 characters. No `Math.random`, ids, timestamps or emails. |
| Storage | Collection `auth_tokens`. Only `SHA-256(token)` (hex) is stored in `tokenHash`. The raw token exists in the emailed link only. Not in the database, not in the server log (checked: G-13). |
| Document | `userId, purpose ("reset_password" or "verify_email"), tokenHash, expiresAt, usedAt, createdAt, requestMetadata.ipHash` (16 hex characters of a SHA-256 of the client address). No password, no password hash, no session data. |
| Expiry | 30 minutes for reset links (config 5-120); 24 hours for email confirmation (config 1-72). Checked in every query (`expiresAt > now`); the TTL index (`expiresAt`, 0 s) only cleans storage. |
| Single use | `findOneAndUpdate({ tokenHash, purpose, usedAt: null, expiresAt > now }, { usedAt: now })`: atomic, so two simultaneous requests cannot both succeed. A used token is refused. |
| Lookup | By hash, unique index. Comparison happens inside the database on the hash (an attacker cannot learn anything useful from timing against a 256-bit space). |
| Purpose | A confirmation token cannot reset a password and the reverse (F-04). |
| One active token | Issuing a token deletes the user's earlier unused tokens of that purpose. A completed reset deletes all of the user's tokens. |
| Validation without use | `peekToken` (used by the reset page and `POST /api/auth/reset-password/validate`) never consumes. A refused weak password does not burn the link (F-06). |
| Shape check | Anything not matching `^[A-Za-z0-9_-]{43}$` is rejected before the database is touched. |
| Link | `APP_URL` + `/reset-password?token=...`. `APP_URL` is required in production; the Host header is never used (M-27). The reset and confirmation pages send `Referrer-Policy: no-referrer` and `noindex`. |

Indexes: `{ tokenHash: 1 }` unique, `{ expiresAt: 1 }` TTL, `{ userId: 1, purpose: 1 }`.
