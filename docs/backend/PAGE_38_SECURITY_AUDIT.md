# Page 38 — Authentication and session audit (before building, 2026-11-11)

Evidence from the repository, not from what the Settings page appeared to offer.

| Area | Found | Consequence |
|---|---|---|
| Passwords | scrypt (`src/lib/auth/password.ts`): 16-byte random salt, 64-byte key, constant-time compare; stored as `salt:hash` hex. One shared policy (`checkBuyerPassword`, 10–128 characters) for registration, reset and change | Reused unchanged. No second hashing implementation |
| Session cookie | `finbyn_session`: HMAC-SHA256-signed `{sub, v, exp}`; HttpOnly, SameSite=Lax, Path=/, Secure in production, 7 days | **Stateless.** Nothing on the server records that a session exists |
| Revocation | Only by raising the account's `sessionVersion` (password change, password reset, "sign out everywhere"): every cookie of the account dies at once | **No per-session list and no per-session revocation were possible.** A session list on the page would have been invented |
| Session metadata | none (no device, browser, created or last-active time) | nothing real to display |
| Login logging | `lastLoginAt` on the user only. No failed-login record, no sign-in history, no logout record | history can only start when recording starts |
| Security events | `security_events` existed (`{userId, type, at, fields}`): PASSWORD_CHANGED, PASSWORD_RESET (with a hashed client address), SIGNED_OUT_EVERYWHERE, profile/company/document/address events. One index `{userId, at}` | Reused (same collection, same rows); new types added; profile-type rows are excluded from the security timeline |
| Rate limiting | `rate_limits` (Mongo, fixed windows): login 10/10 min per client address, change-password 5/10 min per account, sign-out-everywhere 5/10 min | Reused. Added limits for revocation and acknowledgement |
| CSRF | SameSite=Lax cookie only | Added an origin check on the new state-changing routes |
| Two-step verification | **None.** No TOTP, no SMS or email one-time-code service, no recovery codes, no second step at sign-in | BLOCKED (see PAGE_38_TWO_FACTOR_RULES.md) |
| Email | provider optional (`emailConfigured()`), nothing configured; used for verification and reset links only | Security alerts are in-app only; no email claimed |
| Mobile verification | none (`phoneVerified` always false: no SMS provider) | never shown as a recovery method |
| Notifications | buyer in-app notifications, category `account` required (cannot be switched off); `PASSWORD_CHANGED` and `SIGNED_OUT_EVERYWHERE` existed | three types added |
| Geo / IP location | none, no approved source | region is always "Unknown"; no IP is stored |
| Roles | buyer / supplier only; buyer routes check the role | reused (`requireBuyerApi`) |
| Page 25 | Account & Security section with the change-password form, a sign-out-everywhere button that said "a list of your devices is not available" | now links to Page 38; text updated |

## Critical risks found
1. An attacker holding a stolen cookie could not be cut off without changing the password (nothing per-session).
2. No sign-in or failed-sign-in history existed, so a takeover could not be noticed.
3. A session identifier did not rotate on credential change (the cookie was simply re-signed).

## Migration plan (implemented; see PAGE_38_SESSION_REGISTRY.md)
New `auth_sessions` registry that **takes part in authentication**; cookies gain an opaque `sid`; cookies issued before the change keep working until their own expiry (at most 7 days) and are ended by sign-out-everywhere, password change and reset; `AUTH_REQUIRE_SESSION_REGISTRY=1` ends them at once after the window; rollback = deploy the previous code (old cookies, which never carried a `sid`, are unaffected; new cookies' extra field is ignored by the old reader and the registry collection is simply unused).

## Not found, therefore not built
Two-step verification, recovery codes, mobile recovery, email security alerts, geo-IP, device trust, step-up authentication for revocation.
