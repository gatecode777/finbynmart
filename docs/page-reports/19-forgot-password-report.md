# Page 19 — Forgot Password: implementation report

**Status:** Implemented and tested against the throwaway database. **Email delivery is BLOCKED**: no email provider credentials exist, so delivery by a real service has never been exercised; the application reports "email is not set up" instead of pretending, and the tests used a local stand-in provider.

## Audit findings
See `docs/backend/PAGE_19_FORGOT_PASSWORD_AUDIT.md`. One `users` collection for both roles; scrypt hashing; stateless signed-cookie sessions (no revocation at the time of the audit; added with Page 20); no email provider, queue or audit log existed.

## Files
Frontend: `src/app/forgot-password/page.tsx`, `src/components/auth/RecoveryForms.tsx` (`ForgotPasswordForm`), `AuthLayout.tsx` (variant `forgot`), `Auth.module.css`.
Backend: `src/lib/auth/{securityConfig,recovery,tokens,mail,users}.ts`, `src/lib/auth/http.ts` (429 body carries `retryAfter`), `src/app/api/auth/forgot-password/route.ts`, `.../forgot-password/resend/route.ts`, `.../reset-password/validate/route.ts`.
Tests: `docs/page-reports/tools/15-buyer-registration-test.mjs` (groups F and G), `alias-loader.mjs`.

## APIs
`POST /api/auth/forgot-password`, `POST /api/auth/forgot-password/resend`, `POST /api/auth/reset-password/validate` (new); `POST /api/auth/reset-password` (existing, shared token service). See `PAGE_19_PASSWORD_RECOVERY_API.md`.

## Schema
`auth_tokens` gained `requestMetadata.ipHash` (optional). No index changes. Reset lifetime 30 minutes (was 1 hour).

## Results
Buyer and supplier both recover through the same endpoint and the same reset page (F-01..F-13, G-14). Enumeration, token, resend, rate-limit and injection tests pass: see `PAGE_19_TEST_REPORT.md` (63/63 with the stand-in provider, 113/113 without).

## Performance
Whole-request time: 103 ms (registered) and 105 ms (unregistered), median of five, mostly three limiter writes to Atlas. Stage timings were not measured separately.

## Remaining blockers and gaps
- No real email provider: set `EMAIL_API_KEY`, `EMAIL_FROM`, `APP_URL` to enable; delivery untested.
- The PRD's `/login/buyer` and `/login/supplier` do not exist; after a reset the person goes to `/sign-in`.
- Sessions are now revoked by a reset (added with Page 20 via a session version; see PAGE_20_SESSION_REVOCATION.md).
- No mail queue with retries and no delivery status; a failed send is logged and the person can request again after the cooldown.
- The reference's background photograph and "Account Recovery" pill are not built (no approved image).
- Contrast, Lighthouse, Firefox/Safari, landscape and zoom were not tested.

## Tracker
Rows 21 (Forgot Password) and 22 (Reset Password) updated in `docs/PAGE_TRACKER.md`: Development Implemented, QA In Progress (not responsive-verified beyond the 16-width overflow check; not QA complete).
