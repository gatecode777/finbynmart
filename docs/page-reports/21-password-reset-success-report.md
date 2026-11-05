# Page 21 — Password Reset Success: implementation report

**Status:** Implemented; behaviour verified on the throwaway database; QA not complete. Email delivery is still BLOCKED (no provider), so the end-to-end run used the stand-in provider.

**Audit:** `docs/backend/PAGE_21_SUCCESS_AUDIT.md`.
**Files:** `src/app/password-reset/success/page.tsx`, `src/components/auth/{NextSteps,RetryButton}.tsx`, `AuthLayout.tsx` (variant `resetDone`), `src/lib/auth/resetConfirmation.ts`, `securityConfig.ts` (confirmation window), `passwordReset.ts` (the event now records role and `sessionsRevoked`, and returns its id), the reset route (sets the cookie), `ResetPasswordForm.tsx` (navigates to the success page; its own success screen was removed), `next.config.ts` (headers).
**Mechanism:** signed short-lived httpOnly cookie bound to the committed `security_events` row; no new collection.
**Routing:** buyer `/login/buyer`, supplier `/login/supplier` (aliases of `/sign-in`), unknown role `/sign-in`.
**Sessions:** the claim is shown only when the stored event recorded revocation.
**Results:** 160/160 in mail mode, 113/113 without a provider. Latency median 47 ms, p95 55 ms.

**Gaps:** reference photograph not built; the reference's second sign-in button deliberately not shown (PRD part 7); UNAVAILABLE state not fault-tested; HTTPS, Lighthouse, contrast, Firefox/Safari, landscape, zoom not run; no email notification of the reset.
**Tracker:** new row ID 98 (Password Reset Success); total updated.
