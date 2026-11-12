# Page 38 — Buyer Account Activity & Security: implementation report

Date: 2026-11-11. Route `/buyer/security` (tracker ID 107). Part of Settings & Notifications (that item stays highlighted; the Settings page links here).

## Audit findings (details: `docs/backend/PAGE_38_SECURITY_AUDIT.md`)
Sessions were stateless signed cookies: no list, no per-session revocation, no device information; the only control was raising the account's session version. There was no sign-in or failed-sign-in history (only `lastLoginAt`), no two-step verification, no recovery codes, no mobile verification, no email provider configured, and no location source. Passwords (scrypt), the shared policy, the change-password route, rate limiting, `security_events` and the in-app notifications existed and were reused.

## What was built
- **Authentication change (the main one):** a server-side session registry (`auth_sessions`) that takes part in every authenticated request. Cookies carry an opaque `sid`; only its SHA-256 is stored. A revoked, expired or unknown session is refused on its next request. Password change rotates the session id; logout, reset and sign-out-others end records. Cookies from before keep working until they expire (≤ 7 days) and are ended by sign-out-others, password change and reset; `AUTH_REQUIRE_SESSION_REGISTRY=1` ends them at once. Rollback = deploy the previous code. (`PAGE_38_SESSION_REGISTRY.md`)
- **Backend:** security events (sign-in, coalesced failed sign-ins, sign-out, revoked device, alerts) in the existing collection; `security_alerts` with fixed rules (new device, 5 failures in 15 minutes, password change, devices signed out); overview with documented status criteria; recovery methods (read-only, honest); in-app notifications; nine routes under `/api/buyer/security/*`; one `signOutOtherDevices` service shared with the Settings button; origin check on state-changing routes; `GET /api/health` (liveness) because an outside caller was getting 404s.
- **UI:** six tabs (overview, password, two-step verification, active sessions, login activity, security notifications), four cards, revoke and sign-out-others confirmations, tables that become cards on phones, per-tab loading/empty/error states.

## BLOCKED (not simulated)
Two-step verification and recovery codes (no second-factor service; the tab states it and has no controls), email security alerts (no provider; alerts are in-app and mandatory), mobile recovery (no SMS), location (no approved source; always "Unknown"), changing recovery email/mobile (no flow exists), configurable alert preferences (mandatory by policy), step-up authentication.

## Revocation proof
Test C-01: with three real browser sessions of one account, ending one marks its record revoked and **that browser's very next request is refused** (`/api/auth/me` shows no user, the security API answers 401) although it worked just before; the other sessions kept working. D-01: sign out other devices returned the real count, ended all others (including a pre-registry cookie), kept this session with the same record. G-04: after a password change the cookie from before the change is refused. A-06: a signed cookie naming an unregistered session id is refused.

## Tests
Unit 20/20; integration 99/99 (browser flows, 16 widths, performance with 20 sessions / 10,000 events / 2,000 alerts); reset test 4/4; 15 regression suites pass (list in `PAGE_38_TEST_REPORT.md`). Performance targets met; the registry adds no measurable latency to authenticated requests (`/api/auth/me` p95 51 ms both ways, same run). Screenshots: `docs/page-reports/screenshots/38-security-*.png` (1440 and 390 viewed).

## Files
Created: `src/lib/auth/{deviceInfo,sessionRegistry}.ts`; `src/lib/security/{securityRules,securityEvents,sameOrigin}.ts`; `src/lib/buyer/{security,securitySessions}.ts`; `src/app/api/buyer/security/**`; `src/app/api/health/route.ts`; `src/app/buyer/security/page.tsx`; `src/components/buyer/security/*`; tests `docs/page-reports/tools/38-*.mjs`; docs `docs/page-designs/38-*.md`, `docs/backend/PAGE_38_*.md`.
Modified: `src/lib/auth/session.ts`, `passwordReset.ts`; the login, logout, change-password, reset-password and settings sign-out routes; `src/lib/buyer/{notifications,profile}.ts`; `SecurityPanel.tsx` and `SignOutEverywhere.tsx`; `usePagedFetch.ts`; the Page 23 test (two expectations); `CLAUDE.md`, `DATABASE_SCHEMA.md`, `API_REFERENCE.md`, `PAGE_TRACKER.md`.

## Status
Design Complete. Development Implemented (not "Functionally Verified" for two-step verification and email alerts, which do not exist). QA In Progress: Chrome only; accessibility tooling, Firefox, Safari, landscape and real zoom not run.
