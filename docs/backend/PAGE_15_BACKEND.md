# Page 15 backend — buyer registration, email confirmation, password reset, Contact Us

Everything below exists in code and was exercised by `docs/page-reports/tools/15-buyer-registration-test.mjs` (both modes) and `15-buyer-registration-unit-test.mjs`. Responses use the project shape `{ ok, message, fields? }`.

## Endpoints

| Method and path | Body | Success | Notable failures |
|---|---|---|---|
| `POST /api/auth/register/buyer` | `name, email, phone{countryCode,number}, companyName, password, confirmPassword, consent:true, consentPolicyVersion` | 201 `{ ok, message, user?, verification, signedIn }` | 400 field errors (forbidden server-only keys included) · 409 email exists · 429 · 503 |
| `POST /api/auth/verify-email` | `{ token }` | 200 | 400 `fields.token` (unknown, used, expired) · 429 |
| `POST /api/auth/resend-verification` | `{ email }` | 200, same text for any address | 503 when no email provider · 429 (10/h/IP, 3/h/email) |
| `POST /api/auth/forgot-password` | `{ email }` | 200, same text for any address | 503 when no email provider · 429 (10/h/IP, 3/h/email) |
| `POST /api/auth/reset-password` | `{ token, password, confirmPassword }` | 200 | 400 field errors (the link is not used up by a refused password) · 400 `fields.token` · 429 |
| `POST /api/auth/login` (existing) | unchanged | now also records `lastLoginAt` | 403 `code: "email_not_verified"` (only after a correct password) · 403 suspended |
| `POST /api/support/requests` | `name, email, phone?{countryCode,number}, topic, message, consent:true, consentPolicyVersion, idempotencyKey?` | 201 `{ reference: FBM-SUP-XXXXXXXX, notified:false }` (200 on an idempotent replay) | 400 fields · 429 (5/h/IP, 3/h/email) · 503 |

Pipeline for registration: small JSON body (4 KB) → validation of every field → rate limit (10 well-formed registrations per hour per address; invalid requests cost nothing and never count) → account → email if a provider exists.

## Verification model

- **Email provider configured** (`EMAIL_API_KEY` + `EMAIL_FROM`; optional `EMAIL_API_URL`; `APP_URL` is required in production): a new buyer is `PENDING_EMAIL_VERIFICATION`, no session is opened, a 24-hour single-use link is emailed, and sign-in is refused (403, after a correct password) until the link is used.
- **No provider**: nobody could ever confirm an address, so the account is `ACTIVE` with `emailVerified: false`, the buyer is signed in, forgot-password and resend answer 503 "email is not set up", and nothing says an email was sent.
- Links are built from `APP_URL`, never from the request `Host` header (tested with a forged Host). In production without `APP_URL` the send is refused.
- Opening the confirmation link does not use the token (mail scanners open links). The page shows a button; its single POST uses the token.
- Using a reset link proves control of the mailbox, so it also confirms the address and activates a pending account. A suspended account gets no reset email.
- **Mobile OTP: not implemented** (no SMS provider). `phoneVerified` is always `false`.

## Collections

`users` gained optional fields: `phone{countryCode,number,normalized}`, `companyName`, `companyStatus:"UNVERIFIED"`, `accountStatus` (`ACTIVE | PENDING_EMAIL_VERIFICATION | SUSPENDED`; absent = ACTIVE for older accounts), `emailVerified`, `phoneVerified`, `consent{acceptedAt,policyVersion}`, `lastLoginAt`, `updatedAt`. Index unchanged (`email` unique).

`auth_tokens`: `{ userId, purpose: "verify_email"|"reset_password", tokenHash (SHA-256 hex), expiresAt, usedAt, createdAt }`. Indexes: `tokenHash` unique, `expiresAt` TTL (0 s), `{userId,purpose}`. Only the hash is stored. Consumption is one atomic `findOneAndUpdate`, so two requests cannot both use a token. Issuing a new token for a purpose deletes the user's earlier unused ones; a password reset deletes all of the user's tokens. Verify tokens last 24 h, reset tokens 1 h.

`support_requests`: `{ reference (unique), name, email, phone?, topic, message, userId? (session only), consent{acceptedAt,policyVersion}, status:"NEW", idempotencyKey? (unique sparse), notification{status:"BLOCKED"}, createdAt }`, index `{email,createdAt}`. Nothing reads these yet (no admin or support inbox).

## Security properties

Passwords: scrypt with a per-password salt (existing `password.ts`), 10–128 characters (the cap bounds hashing work). Mass assignment refused. Same answer for unknown and wrong credentials; account state only after a correct password. Enumeration: forgot/resend answer identically for any address; **registration does answer 409 for an existing email** (usability over secrecy; it is rate limited). `getCurrentUser()` now returns nothing for a non-ACTIVE account, so a suspended account loses its session at once. Reset and confirm pages send `Referrer-Policy: no-referrer` and `noindex`.

## Known gaps (not hidden)

- Sessions are stateless signed cookies: a password reset does **not** sign out other devices.
- No CAPTCHA or bot challenge; abuse control is the rate limits only.
- Role enforcement for dashboards is still absent project-wide.
- Consent wording version `2026-11-02` refers to the sentence on the forms; the Terms and Privacy pages are not published yet (the links reach the site's "not published" page).
- No real email provider was available: delivery by a real service is **untested**. The tests used a local stand-in that records what the application sends.
