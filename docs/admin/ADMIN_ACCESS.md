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
