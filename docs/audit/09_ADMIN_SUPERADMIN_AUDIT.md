# 09 — Admin and Super Admin Audit

## Roles
| Role | Exists? | Evidence |
|---|---|---|
| Super Admin | ❌ | No such role value |
| Admin | ❌ | `UserRole = "buyer" \| "supplier"` in `src/lib/auth/users.ts` |
| Moderator | ❌ | |
| Supplier | ◐ | Role value exists; no permissions attached |
| Buyer | ◐ | Role value exists; no permissions attached |

## Access control
- No RBAC implementation, permission model, or middleware.
- No protected route exists, so there is nothing to test for unauthorised access. "Test that restricted actions cannot be performed by unauthorised users" is **not applicable yet**: no restricted action exists.
- There is no admin bootstrap path; nothing prevents a future `role` from being client-set because registration reads `body.role` (today only `supplier` is honoured, everything else becomes `buyer`).

## Capability checklist
User management, supplier approval, product approval, category management, inquiry monitoring, subscription control, payment monitoring, platform analytics, reports, audit logs, global settings: **all missing** (0 of 11). No admin or super-admin pages exist (25 pages listed as not started in doc 02).

## Required before any admin work
A role/permission model, an admin bootstrap that cannot be reached from the public registration endpoint, server-side authorisation helpers, an audit-log collection, and middleware protecting `/admin/*`.
