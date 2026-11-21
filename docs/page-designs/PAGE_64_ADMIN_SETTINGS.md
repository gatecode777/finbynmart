# Page 64 — Admin Settings

Route: `/admin/settings` (`?tab=security`) · Portal: ADMIN · Tracker ID 64. The administrator's OWN account only. The original plan names the page but no detailed specification exists, so the minimal scope below was used; global administration was not inferred.

## Scope map
| Setting | Plan / source evidence | Existing service reused | Editable / read-only |
|---|---|---|---|
| Display name | design reference; same rule as sign-up | `checkFullName` (`buyerRegistration.ts`), `FORBIDDEN_PROFILE_FIELDS`; new narrow adapter `settings.ts` (the buyer/supplier profile services are role-specific) | Editable |
| E-mail | design reference | none (no verified change-e-mail flow exists) | Read-only, explained |
| Role | design reference | none | Read-only ("Administrator"), "Permissions are managed separately." |
| Notification preferences | design reference; Page 62 now exists (verified in code) | Page 62 service (`notifications.ts`), extended with real enforcement | Editable, only for categories the admin may see |
| Password | shared flow | `ChangePasswordForm` + `POST /api/auth/change-password` (works for any signed-in role, verifies the current password, rate limits, signs out other devices); `/forgot-password` | Editable through the existing form; reset link |
| Session list, sign out other devices | shared security module | **Not usable**: `/buyer/security` and `/supplier/security` and their `/api/buyer/security/*` accept buyers and suppliers only | Omitted (no control), stated on the page |
| Two-step verification, recovery | not built | none | Omitted, stated |
| Admin creation, roles, permissions, platform, payment, tax, providers, keys, maintenance, timezone, branding | out of scope (Super Admin pages 66–73 stay deferred) | n/a | Not built |

## Files
`src/lib/admin/settingsRules.ts`, `settings.ts`, `src/app/api/admin/settings/route.ts`, `profile/route.ts`, `notifications/route.ts`, `src/app/admin/settings/page.tsx`, `src/components/admin/AdminSettingsWorkspace.tsx`, `AdminSettings.module.css`. Page 62 code extended: `src/lib/admin/notifications.ts` (preferences). `AdminShell.tsx` (nav). Tests: `88-admin-settings-unit-test.mjs` (12), `it-admin-settings.mjs` (integration, BLOCKED).

## Access and identity
Any administrator account that can enter the admin portal (role admin, active, at least one capability: `requireAnyAdminPage/Api(ADMIN_CAPABILITIES)`). No capability is implied and none is granted; self-settings give no access to other admins, roles, records or global settings. The account is selected only by the verified session id with `role: "admin"` in every query; no id parameter exists. Notification preferences additionally need `notifications.read`.

## API
`GET /api/admin/settings`: account (name, e-mail, role label, e-mail confirmed), the notification categories the admin may see with their on/off state, and which security functions exist; safe fields only (no hash, token, session data or permissions). `PATCH /api/admin/settings/profile { name }`: one-field allowlist; e-mail, role, permissions, status, ids, password and any other key are a 422 naming the field; one transaction with an audit row (`ADMIN_DISPLAY_NAME_CHANGED`) that records the fact, not the names; the same name is a no-op. `PATCH /api/admin/settings/notifications { categories: [keys to show] }`: only categories whose capability is held now (else 422); states of categories not currently held are kept. Writes: cross-site refusal first, rate limit 30 per 10 min, small bounded JSON, success only after the write; all responses `private, no-store`. No generic "update any setting" endpoint exists.

## Notification preference semantics (implemented and enforced)
- **Default:** every category the admin is authorized for is shown (nothing hidden).
- **Effect:** a category turned off is hidden from THIS admin's notification list, unread count, header bell, single mark-as-read and mark-all (all four use the same `allowedTypes`: capability held now minus hidden categories). It affects the inbox view, not delivery: events are still recorded for everyone authorized, nothing is deleted and no read state is changed.
- **Existing unread items:** they remain stored but are not shown or counted while hidden; mark-all does not touch hidden categories.
- **Re-enabling:** the existing events of that category appear again with the read state they already had (receipts and cutoff are unchanged), so older unread events come back unread. No backfill.
- **Permission changes:** a preference never grants access; revocation still blocks the category whatever the preference; a category the admin does not currently hold keeps its stored state.
- **Mandatory categories:** none; business tasks are created regardless and are unaffected, and a preference cannot approve or resolve anything.
- Only in-app categories exist: no e-mail, SMS or push options are shown.

## Security destination
There is no admin security page. The Security tab reuses the existing shared password form (labelled fields, policy, "current password" verification, rate limit, other devices signed out) and the existing `/forgot-password` reset link (public route), and states that session management and two-step verification are not available for administrator accounts yet. Extending `/api/buyer/security/*` to admins would be a separate authentication task and was not done.

## UI
Account and Security tabs (`tablist`, arrow keys, URL `?tab=security`); Account details (display name, read-only e-mail and role with explanations) with Save Changes and Cancel; Notification preferences card with real switches (`role=switch`, `aria-checked`, name and description saying Shown or Hidden), Save Preferences and Cancel; sections save independently and nothing is optimistic; a failed save keeps what was entered or switched and says nothing was changed; Cancel restores the last SAVED values; double submits are blocked synchronously; 422 errors are inline with `aria-invalid` plus a summary; an expired session is explained without losing input; states: unavailable (no categories, no notification access), load failure with a retry link. After a name save the header re-reads the account through the existing auth-change event. The design board's example e-mail, "Illustrative account" tag and "Security tab reference" panel are not rendered.

## Verified
Passed: `tsc`; lint; production build; 12 unit checks; Page 62's 17 checks still pass with the enforcement added; signed-out `GET`/`PATCH` = 401, cross-site `PATCH` = 403, the page redirects to sign-in keeping `?tab=security`. Mocked-API browser checks on a temporary fixture page (removed): 30 checks (read-only fields, Save/Cancel states, exactly one PATCH with only `name` or only `categories`, header and bell notified only after success, 422 / 503 / 401 keeping input, double submit, switch semantics, the security tab content and arrow-key tabs, unavailable states, no write on load, 8 widths, landscape, a 200 %-zoom width, long e-mail wrapping, keyboard focus). Screenshots `st-1280.png`, `st-390.png` in the session scratch folder (not individually reviewed).

## Blocked / not verified
`it-admin-settings.mjs` (the name transaction and audit, other roles untouched, and the preferences' real effect on list, count and mark-all, re-enabling, personal scope, unauthorized refusal, revocation) is written and **not run**: no isolated database. Not run: signed-in checks, HTTP 403 by role, the header actually showing the new name, the real password change for an admin account, Firefox, Safari, devices, screen reader, contrast tool. The mocked switches prove the UI only; the preference behaviour is proven by static contracts and the blocked integration suite, not by runtime.

## Gaps
Admin session management and two-step verification need an admin-capable security module. A verified change-e-mail flow does not exist. The name has no concurrency version (last write wins; it is the owner's own field).
