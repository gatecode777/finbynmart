# Page 20 API

Shared contract with Page 19 (`PAGE_19_PASSWORD_RECOVERY_API.md`). All answers are `Cache-Control: no-store`.

## POST /api/auth/reset-password/validate

Body `{ token }` (max 1 KB). Answer `{ ok: true, valid: boolean, state }`, state one of VALID, INVALID, EXPIRED, ALREADY_USED, REVOKED. Does not use the token. An account that cannot be recovered (deleted or suspended) is reported as INVALID; nothing about the account is returned. A temporary database failure is 503 "Unable to verify this link right now", never INVALID. 30 per 10 minutes per client address.

## POST /api/auth/reset-password

Body `{ token, password, confirmPassword }` (max 2 KB). Other fields (userId, email, role, redirectTo...) are ignored.

1. 20 per 10 minutes per address. 2. Password rules and confirmation (400 `fields.password` / `fields.confirmPassword`; the link is not used). 3. Token inspected without using it; not VALID gives 400 `{ code, fields: { token: code }, message }` before any hashing. 4. Password hashed with the shared scrypt function. 5. One transaction (see `PAGE_20_ATOMIC_RESET_FLOW.md`). 6. This browser's session cookie is cleared.

Success 200: `{ ok: true, message: "Your password has been updated successfully.", data: { redirectTo } }` with `redirectTo` `/login/buyer` or `/login/supplier` from the stored role. Never returned: token, password, hash, id, session data.

Failures: 400 with code INVALID / EXPIRED / ALREADY_USED / REVOKED (messages in `src/lib/auth/resetMessages.ts`), 400 field errors, 429, 503 `{ code: "UNAVAILABLE", message: "...Nothing was changed." }`.

## Aliases

`/login/buyer` and `/login/supplier` redirect to `/sign-in` (route aliases, not separate pages).
