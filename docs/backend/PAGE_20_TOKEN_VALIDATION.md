# Token validation (Page 20)

Code: `inspectToken()` in `src/lib/auth/tokens.ts`; messages in `src/lib/auth/resetMessages.ts`.

Order of checks, all against the stored row found by `SHA-256(token)` and `purpose = reset_password`:

1. Shape: 43 URL-safe characters, else INVALID without touching the database. Objects, arrays, null, numbers are INVALID.
2. No row: INVALID (also the case for a made-up token and for a confirmation token of the other purpose).
3. `usedAt` set: ALREADY_USED.
4. `expiresAt` passed: EXPIRED (a replaced link that has also expired is reported as expired).
5. `revokedAt` set: REVOKED (replaced by a newer link, or revoked by a reset).
6. Account missing or SUSPENDED: ACCOUNT_UNAVAILABLE internally, shown to the public as INVALID.
7. Otherwise VALID.

Rows stay for 24 hours after expiry (`purgeAt` TTL) so the states above are reportable; the TTL only cleans storage, every check tests the state itself. Reads use minimal projections (`userId, expiresAt, usedAt, revokedAt`, then `accountStatus, role`).

Neither the validate endpoint nor the page load (a GET, as mail scanners make) changes anything. Only the POST of the reset form consumes a token.

Tested: H-01 to H-09, H-37, H-38, H-55, H-56.
