# Page 20 — Reset Password: implementation report

**Status:** Implemented; functional behaviour verified on the throwaway database; QA not complete (see "Not run" in the test report). Email delivery remains BLOCKED (no provider), so the end-to-end test used the local stand-in provider.

**Audit findings:** `docs/backend/PAGE_20_RESET_PASSWORD_AUDIT.md`. The existing reset route worked but was not atomic, reported only valid/invalid, and could not revoke sessions.

**Frontend:** `src/app/reset-password/page.tsx`, `src/components/auth/ResetPasswordForm.tsx` (new), `PasswordField.tsx` (icon), `AuthLayout.tsx` (variant `reset`), `Auth.module.css`, route aliases `src/app/login/{buyer,supplier}/page.tsx`.
**Backend:** `src/lib/auth/{tokens,passwordReset,resetMessages,session,users,buyerRegistration}.ts`, `src/app/api/auth/reset-password/{route,validate/route}.ts`, `next.config.ts` (headers), `login/route.ts` (session version).
**Also fixed this session:** `src/instrumentation.ts` early-return form that broke `next dev` with `UnhandledSchemeError` (now `instrumentation-node.ts`).

**Schema:** `auth_tokens` gained `revokedAt`, `purgeAt` (TTL index; the old `expiresAt` TTL index is dropped when found); `users` gained `sessionVersion`, `passwordChangedAt`; new `security_events` `{ userId, type, at, ipHash }` with index `{ userId, at }`.

**Results:** token states, single use, one winner among six simultaneous requests, atomic password + token, session revocation by version, role-based redirect, policy, URL hygiene, end to end: all passed (124/124 in mail mode). See `PAGE_20_TEST_REPORT.md`.

**Password policy used:** the registration policy (10-128, not blank, not common). The reference's uppercase/lowercase/number rows were not added.

**Redirects:** `/login/buyer` and `/login/supplier` exist only as aliases to `/sign-in` (there is one sign-in page).

**Remaining blockers and gaps:** no real email provider; no "password changed" notification email; reference photo not built; no fault-injection test of the transaction; reset/validate rate-limit 429 not separately tested; Lighthouse, contrast, Firefox/Safari, landscape, zoom not run; HTTPS not testable locally; refresh after the token is stripped shows "link incomplete".

**Tracker:** row 22 (Reset Password) updated (Development Implemented, QA In Progress).
