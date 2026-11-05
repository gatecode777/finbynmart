# Session revocation

Architecture: sessions are HMAC-signed stateless cookies (`finbyn_session`, 7 days). There is no session collection. Revocation is implemented with a **session version** (`src/lib/auth/session.ts`, `users.sessionVersion`):

- The cookie payload carries `v` (the user's session version when it was issued; absent counts as 0).
- `getCurrentUser()` loads the user (it already did) and refuses the cookie when `user.sessionVersion ?? 0 !== v`.
- A password reset increments `sessionVersion` inside the reset transaction, so every cookie issued before it stops working at once, on every device, for that account only.
- Sign-in reads the current version and issues a cookie carrying it, so a fresh sign-in after a reset works.
- The browser that performed the reset also has its cookie cleared by the reset answer.
- Accounts that never reset keep working: no migration is needed because a missing version counts as 0.
- A suspended account's sessions are refused regardless (status check).

Tested: H-12 (cookie cleared), H-17 (another account's session and version unchanged), H-20 (a cookie saved before the reset works before and is refused after), H-21 (a new sign-in works), H-22 (an account that never reset still has its session), H-57 (end to end).

Limits: a reset does not sign anyone out of OTHER accounts (by design). There is no "sign out everywhere" button or list of devices; the version bump is the only mechanism. An attacker holding a stolen cookie is cut off only when the owner resets the password.
