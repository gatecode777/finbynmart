# Page 25 — Privacy and data rules

| Item | State |
|---|---|
| Profile visibility | **Not offered.** Buyer profiles and company records are private everywhere on the site; there is no public buyer page for a control to change. Adding a visibility switch without a public profile would be a fake setting |
| Marketing consent | **Not offered.** No marketing messages exist and no consent record exists; nothing is switched on for the buyer |
| Communication consent | In-app notices only; no consent needed beyond the account |
| Data export | **Not available.** No export workflow exists. The page says so and points to support. A secure export would need: an authenticated, rate-limited request, ownership checks, an allow-listed buyer-only data set (no hashes, tokens or internal security data), private short-lived download, and audit events |
| Account deletion | **Not available.** No workflow. Deleting needs checks for active inquiries and retention obligations, a cooling-off period and a record of what was kept; none of that exists. The page says support handles it |
| Policy links | Privacy Policy and Terms use `PRIVACY_PATH` and `TERMS_PATH` (`src/lib/legal.ts`). Those pages are **not published yet** and show the site's honest placeholder |

## What the page never does
- No "request submitted" message: no request is stored.
- No claim that data was exported or deleted.
- No toggle for a privacy control that has no effect.

## What is protected
Settings and notifications are buyer-scoped on every query, private `no-store`, and never contain contact details. Audit records hold field names only. Notification text contains inquiry references and supplier names the buyer already sees, never email, phone, passwords or tokens (tested).

## Open policy decisions (owner)
Retention period for notifications (180 days chosen), what a data export must contain, the deletion workflow and its legal holds, marketing consent wording and storage.
