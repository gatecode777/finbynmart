# Page 19 audit (before and after the work)

Verified against the repository on 2026-11-03.

## Existing structure

- One `users` collection for both roles (`role: "buyer" | "supplier"`), unique index on lower-cased `email`. Supplier details are an embedded `supplier` object. No second accounts collection was created.
- Password hashing: scrypt with a per-password 16-byte salt, stored `salt:hash` (`src/lib/auth/password.ts`). Unchanged.
- Sessions: HMAC-signed `finbyn_session` cookie, 7 days, stateless; `getCurrentUser()` looks the user up on every request. **There is no server-side session store, so a password reset cannot sign out other devices.** (Accounts that are not ACTIVE do lose their session, because `getCurrentUser()` now checks the status.) **Update (Page 20):** this gap is closed: a password reset now bumps a per-user session version and older cookies are refused (see PAGE_20_SESSION_REVOCATION.md).
- Email: no provider existed. `src/lib/email/provider.ts` (Resend-style HTTP API, `EMAIL_API_KEY`, `EMAIL_FROM`, optional `EMAIL_API_URL`) was added in the forms work; with no credentials it reports `not_configured` and nothing pretends to be sent. No job queue exists.
- Rate limiting: MongoDB fixed-window limiter (`src/lib/security/rateLimit.ts`). No audit log exists.
- A reset flow existed from the forms work (hashed single-use tokens in `auth_tokens`, 1-hour expiry, per-email limit). Page 19 hardened and extended it.

## Gaps found against the PRD and what was done

| Gap | Resolution |
|---|---|
| Expiry fixed at 1 hour | 30 minutes by default, configurable (`AUTH_RESET_TTL_MINUTES`, 5-120) in `securityConfig.ts` |
| No resend endpoint or cooldown | `POST /api/auth/forgot-password/resend`, shared handler, 60 s cooldown per address (`AUTH_RESEND_COOLDOWN_SECONDS`, 30-600) |
| No token-validation endpoint | `POST /api/auth/reset-password/validate` (only `{ ok, valid }`) |
| Account lookup loaded the whole document | `findRecoveryAccount`: indexed on email, projection `name, email, accountStatus` |
| Timing could differ for known and unknown addresses | Lookup and email run after the response (`after()`); medians measured 103 ms vs 105 ms |
| Plain-text email | Branded HTML + text email, escaped dynamic content, logo, button, expiry, ignore-this-email advice |
| No request metadata | Token stores a truncated hash of the client address (never the address) |
| `/login/buyer`, `/login/supplier` | Do not exist; `/sign-in` serves both roles |

## Still missing (not done)

An audit-log reader (session revocation was added with Page 20), a mail queue with retries (a failed send is logged and the person may request again), delivery status from the provider, real email credentials.
