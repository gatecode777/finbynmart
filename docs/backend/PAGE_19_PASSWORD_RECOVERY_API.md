# Password recovery API

Errors use `{ ok: false, message, fields?, code? }`; every limiter response is 429 with `Retry-After` and `{ code: "RATE_LIMITED", retryAfter }`.

## POST /api/auth/forgot-password and POST /api/auth/forgot-password/resend

One shared handler (`src/lib/auth/recovery.ts`), one cooldown. Body (max 1 KB): `{ "email": "..." }`. Any other field (role, userId, redirect...) is ignored.

Order: limit per client address (10 per hour) → small JSON body → email syntax (400 `fields.email`) → email provider configured? (503 `fields.email: "not_configured"` with a plain message when not; this depends only on server setup, not on the account) → cooldown per address (1 per 60 s) → per-address limit (3 per hour) → generic answer → after the response: indexed lookup, eligibility, token, email.

Success (200, `Cache-Control: private, no-store`), identical for every address:

```json
{ "ok": true, "message": "If an eligible account exists for this email address, password reset instructions will be sent.", "cooldownSeconds": 60, "validMinutes": 30 }
```

Eligibility: any account that is not SUSPENDED (buyers and suppliers alike, confirmed email or not: using the link proves control of the mailbox and confirms the address). The role comes from the stored account and is never returned. Never accepted from the client: userId, role, accountStatus, tokenHash, passwordHash, emailVerified, redirect.

## POST /api/auth/reset-password/validate

Body `{ token }` → `{ ok: true, valid: boolean }`, nothing else. Does not consume the token. 30 per 10 minutes per address.

## POST /api/auth/reset-password

Body `{ token, password, confirmPassword }`. Password 10-128 characters (shared `checkBuyerPassword`). The token is checked first and only consumed after the password is accepted. On success: password hash replaced, email marked confirmed (pending accounts become ACTIVE), all of the user's tokens deleted. The answer carries no role; the page sends the person to `/sign-in`. 20 per 10 minutes per address.

## Related

`POST /api/auth/verify-email`, `POST /api/auth/resend-verification` (confirmation flow, same token service). Existing `POST /api/auth/login` returns 403 `email_not_verified` only after a correct password.

## Settings (environment)

`EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_API_URL` (optional), `APP_URL`, `AUTH_RESET_TTL_MINUTES`, `AUTH_VERIFY_TTL_HOURS`, `AUTH_RESEND_COOLDOWN_SECONDS`.
