# Page 65 — Admin Audit Logs

Route: `/admin/audit-logs` · Portal: ADMIN · Tracker ID 65. A READ-ONLY viewer of events that supported workflows actually recorded in `admin_audit_log` (the single administrative audit collection). Nothing is reconstructed from current state, `updatedAt` or assumptions; an action no workflow records does not appear.

## Access
`audit.read` is required AND, per action, the domain's own capability (for example buyer events need `buyers.read`, inquiry events `inquiries.audit`). Audit access is never an indirect route into a domain. The set of visible actions is computed from the capabilities held NOW, on every request. An admin with `audit.read` but no domain capability sees an honest no-scope state, not an empty list. Registry: `AUDIT_ACTIONS` in `src/lib/admin/auditRules.ts` (22 recorded actions, each with capability and target kind); `NOT_RECORDED` lists what is deliberately absent.

## Behaviour
- Filters: action (only visible actions), target reference (prefix search, validated), From/To calendar days (Asia/Kolkata, max 366 days, not in the future). Apply / Reset; the URL carries the applied filters; back/forward restores them.
- Keyset pagination on `(at, _id)` (cursor, page size bounded). No total count is shown (none is computed).
- Detail drawer (`GET /api/admin/audit-logs/[eventKey]`): allowlisted DTO only: event id, action, workflow, actor label, target, time, change summary, bounded reason where recorded. No request hashes, operation keys, IP addresses, contact data, credentials or raw documents. A link to the target is shown only when the admin holds that record page's own read capability.
- A failed read is an alert with Retry, never an empty list. A stale response (older request finishing late) never replaces a newer one.
- Indexes: `audit_newest`, `audit_action_newest`.

## Files
`src/lib/admin/auditRules.ts`, `auditLogs.ts`, `src/app/api/admin/audit-logs/route.ts`, `[eventKey]/route.ts`, `src/app/admin/audit-logs/page.tsx`, `src/components/admin/AdminAuditWorkspace.tsx`, `permissions.ts` (+`audit.read`), `AdminShell.tsx` (nav item built).

## Tests actually run
- `docs/page-reports/tools/89-admin-audit-logs-unit-test.mjs` (13 checks: registry, capability gating, query validation, cursors, DTO allowlist, route guards).
- Browser check against a TEMPORARY fixture page with a MOCKED API (removed afterwards; not a real session, not real data): 16 checks passed on a production build: no horizontal overflow at 320/390/768/1024/1440, server-rendered rows, no request on first render, Apply sends the filter and URL carries it, Reset, detail drawer opens/Escape closes, failure alert + Retry recovers, no-scope state, empty state. Screenshots: `docs/page-reports/screenshots/65-audit-logs-*.png`.
- `it-admin-audit-logs.mjs`: **BLOCKED** until an isolated test database exists (registered in `run-integration-suites.mjs` and `it-preflight.mjs`; the preflight loads it).

## Not verified
Real administrator session and real `admin_audit_log` data, authorization with a real account, query plans (`explain`) against a populated collection, 200% zoom and landscape beyond the width checks, Firefox/Safari/real devices.
