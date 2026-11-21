# Admin access and inquiry management (Page 57)

## Identity and permissions
- An admin is a normal `users` document with `role: "admin"`, `accountStatus: "ACTIVE"` and an `adminPermissions` array. There is **no** web form, registration flow or default credential that creates one.
- Capabilities (default deny; a missing or empty array allows nothing): `inquiries.read` (list, counts, detail), `inquiries.responses` (read supplier responses inside the detail), `inquiries.export` (CSV).
- Authority is read from the account record on every page load and API call (`requireAdminPage` / `requireAdminApi`). Nothing from the request, a cookie or browser storage is trusted. Buyers and suppliers always get 403 JSON from the APIs and `/forbidden?portal=admin` from pages.
- Data scope: the repository has no admin region, organisation or category scoping, so a capability applies to all inquiries. Scoped admins are BLOCKED until such a model is defined.

## Granting access (operator action, not part of the app)
In MongoDB Atlas (or mongosh), on a throwaway or approved account only:
`db.users.updateOne({ email: "<account email>" }, { $set: { role: "admin", adminPermissions: ["inquiries.read", "inquiries.responses", "inquiries.export"] } })`
Sign out and in again. After sign-in an admin lands on `/admin/inquiries`.

## What the page does
- Lists the central `inquiries` collection (one row = one inquiry sent to one supplier), newest first, page size 20 (max 50), filters: reference prefix / product-name substring, status group, received date range (Asia/Kolkata days, max 366, not future).
- Counts: one grouped database read under the search and date filters; groups: All, Awaiting supplier (new, NOTIFIED), In progress (IN_PROGRESS, REPLIED, QUOTED), Closed or ended (CLOSED, CANCELLED, REJECTED). Counted per inquiry-recipient record, not per buyer requirement.
- Detail: original requirement, buyer message, delivery text, buyer display name (never e-mail or phone), assigned supplier, status history, and (with `inquiries.responses`) the last 20 supplier responses.
- Export: same filters, 5,000 rows max, no message text or contact data, `csvCell`, logged by counts.
- Indexes added: `admin_inquiries_newest` (createdAt, _id), `admin_inquiries_status` (status, createdAt).

## Not built (BLOCKED)
Assignment management and lifecycle or moderation actions (no approved admin policy exists, so nothing can change an inquiry), admin audit log (Page 65), quotation links (Page 58), attachments, supplier filter, buyer-name search, scoped admins, notifications.

## Page 77 `/forbidden`
The route exists (`src/app/forbidden/page.tsx`) and resolves the return link from the signed-in role on the server (admins now return to `/admin/inquiries`). The tracker still says Not Started; it has not been verified in a browser, so it is not marked complete.


## Product management capabilities (Page 54)

`products.read` (page, list, approved detail), `products.review` (pending revision data, review link), `products.unpublish` (the unpublish action), `products.export` (CSV). Each is checked per request; none implies another. Details: `PRODUCT_MANAGEMENT.md`.

## Inquiry and supplier management capabilities (Pages 57 and 52)

Inquiries: `inquiries.read`, `inquiries.requirements`, `inquiries.recipients`, `inquiries.responses`, `inquiries.routing`, `inquiries.distribution`, `inquiries.audit`, `inquiries.export`. Suppliers: `suppliers.read`, `suppliers.links`, `suppliers.contacts`, `suppliers.suspend`, `suppliers.reactivate`, `suppliers.audit`, `suppliers.export`. Each is checked per request, every route also needs its page's `.read` capability, and none implies another. An admin who held only `inquiries.read` no longer sees requirement content (message, delivery, specifications) until granted `inquiries.requirements`. Details: `PAGE_57_INQUIRY_MANAGEMENT.md`, `PAGE_52_SUPPLIER_MANAGEMENT.md`.

## Verification capabilities (Page 53)

`verification.read`, `verification.documents`, `verification.notes`, `verification.requestChanges`, `verification.reject`, `verification.approve`, `verification.audit`. Each is checked per request, every verification route also needs `verification.read`, and none implies another. There is no revoke capability. Approval additionally requires the business's `VERIFICATION_POLICY`. Details: `PAGE_53_SUPPLIER_VERIFICATION.md`.

## Category capabilities (Page 55)

`categories.read`, `categories.activation`, `categories.audit`. Each is checked per request, every categories route also needs `categories.read`, and none implies another. There are no create, edit, parent or slug capabilities because those operations are not built. Details: `PAGE_55_CATEGORY_MANAGEMENT.md`.


## Buyer management capabilities (Page 51)
`buyers.read` (page, list, detail), `buyers.contacts` (full e-mail and phone; otherwise masked on the server), `buyers.suspend`, `buyers.reactivate` (each also needs `buyers.read`). Granted individually in `adminPermissions`; default deny. Details: `docs/page-designs/PAGE_51_BUYER_MANAGEMENT.md`.


## Quotation oversight capability (Page 58)
`quotations.read` (read-only page, list and detail). Granted individually in `adminPermissions`; default deny. The requirement link additionally needs `inquiries.read`. No capability exists to change a quotation. Details: `docs/page-designs/PAGE_58_ADMIN_QUOTATIONS.md`.


## Notification capability (Page 62)
`notifications.read` opens the inbox and the header bell; it grants no event. Events are visible only with the capability of their own type: `verification.read`, `products.review`, `support.manage`. Details: `docs/page-designs/PAGE_62_ADMIN_NOTIFICATIONS.md`.


## Report capabilities (Page 61)
`reports.buyers`, `reports.suppliers`, `reports.requirements`, `reports.quotations`, `reports.orders`: aggregate counts only, each report needs its own; none grants record detail. Details: `docs/page-designs/PAGE_61_ADMIN_REPORTS.md`.


## Self-service settings (Page 64)
No capability: any administrator who can enter the portal manages only their own display name, password and personal notification preferences (preferences also need `notifications.read`). It grants nothing about other accounts, roles or records. Details: `docs/page-designs/PAGE_64_ADMIN_SETTINGS.md`.

## Audit logs (Page 65)
`audit.read` opens `/admin/audit-logs` but shows only the actions whose DOMAIN capability the administrator also holds now (for example `buyers.read`, `inquiries.audit`); with none it shows a no-scope state. It never implies a domain capability. Details: `docs/page-designs/PAGE_65_ADMIN_AUDIT_LOGS.md`.

## Audit logs (Page 65)
`audit.read` opens `/admin/audit-logs` but shows only the actions whose DOMAIN capability the administrator also holds now (for example `buyers.read`, `inquiries.audit`); with none it shows a no-scope state. It never implies a domain capability. Details: `docs/page-designs/PAGE_65_ADMIN_AUDIT_LOGS.md`.

## Creating an administrator account
`docs/admin/tools/create-admin.mjs` creates one the way an operator would (role admin, every capability, e-mail already confirmed, password hashed by the application): `ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... node --import ./docs/page-reports/tools/alias-register.mjs docs/admin/tools/create-admin.mjs`. It reads `MONGODB_URI` / `MONGODB_DB` from the environment or the git-ignored `.env.local`, refuses an existing e-mail, and prints only the database name. Choose a strong password (the sign-in form accepts any non-empty password, but anyone who knows an administrator's address and password has every capability), and change it afterwards in Admin Settings. Administrators land on `/admin/dashboard` after signing in.
