# Page 38 — Session registry

Code: `src/lib/auth/sessionRegistry.ts`, `session.ts`, `deviceInfo.ts`. Collection `auth_sessions`.

## What a sign-in does now
1. A random 256-bit session id (`sid`, base64url) is generated.
2. A registry record is inserted: `userId`, `sidHash` (**SHA-256 of the sid only**), a random 16-hex `publicId`, `v` (the account's session version), `createdAt`, `lastActiveAt`, `expiresAt` (+7 days), `revokedAt: null`, `deviceLabel`/`browser`/`os`/`deviceType` (from the browser's User-Agent header, informational only), `deviceKey` (HMAC of account + browser/OS/type, for the new-device check), `approxLocation: null`. The raw User-Agent, IP address, sid and cookie are never stored.
3. The cookie carries `{sub, v, sid, exp}` signed as before (same flags: HttpOnly, SameSite=Lax, Path=/, Secure in production, 7 days).
4. If the registry write fails, the error is thrown and **no cookie is set** (a session that cannot be revoked is never issued).

## What every authenticated request does (`getCurrentUser`)
Reads the account and the session record **in parallel** (no added round trip): the signature, expiry and `v` must match; for a cookie with a `sid` the record must exist, belong to the same account, not be revoked, not be expired and have the same `v`; the account must be ACTIVE. `lastActiveAt` is written in the background at most every 5 minutes. A cookie naming an unregistered `sid` (a chosen id) is refused — session fixation is not possible. Measured cost: `/api/auth/me` p95 53 ms with a tracked session vs 52 ms with a cookie that skips the registry (same run, 40 samples each).

## Indexes
`session_sid_hash` (unique), `session_public_id` (unique), `user_active_sessions` (userId, revokedAt, lastActiveAt -1: list and count without a sort stage), `user_device_key` (userId, deviceKey), `session_retention` (TTL: a record is removed 30 days after it expires).

## Limits and lifecycle
- At most **20 active sessions** per account: a 21st sign-in ends the least recently used (`revokedReason: "limit"`). Because activity time is written every 5 minutes, a heavily used but old session can be the least recently used.
- Rotation: a password change creates a **new** `sid` (old record ended as `rotated`; the new record keeps the original creation time and device). Sign out other devices keeps the current record and re-issues its cookie for the new `v`.
- Logout revokes the record (`logout`) and clears the cookie; a replayed cookie is refused.

## Compatibility with cookies issued before the registry
They carry no `sid`. They are accepted until their own expiry (≤ 7 days), are **not** listed and cannot be ended individually (the page says so for the current browser), and are ended by: sign out other devices, password change, password reset (all raise the session version). Set `AUTH_REQUIRE_SESSION_REGISTRY=1` after the 7-day window to refuse them outright (this switch was not exercised in tests). Rollback: deploy the previous code; nothing else needs undoing.

## Not done
Per-device trust, remember-me, refresh-token style sliding expiry (sessions have a fixed 7-day life), geo-IP.
