# Page 22 audit

Verified against the repository and the test database on 2026-11-03, before the work.

| Module | State | Used for |
|---|---|---|
| Identity | `users` (role buyer or supplier, `accountStatus`, `emailVerified`, `phoneVerified`, `companyName` typed at registration); signed session with a version; `getCurrentUser()` | owner of every query |
| Inquiries | `inquiries`, field `buyerId` (absent for guests), `status`, `productKey`, `createdAt`; index `{buyerId, createdAt}` | KPI, trend, categories, recent, active count |
| Quotations | **does not exist** | shown as not available |
| Orders, order value | **do not exist** | not available (never a zero) |
| Wishlist, saved suppliers | `wishlists`, `wishlist_suppliers` (unique `{userId, key}`) | counts (a count method was added to each service) |
| Cart, notifications | do not exist | not available |
| Company records | none; only the company name on the user | account status card; no company verification |
| Business verification | no workflow | "Not available yet" |
| Categories | derived from the product an inquiry names (catalogue product category, or sample product category) | breakdown |
| Suppliers | public catalogue sellers (`getSupplierListing`); none verified, no ratings in the data | recommendations |

Findings: the database holds no company, quotation, order, cart or notification collection, so five dashboard widgets can only be honest placeholders. Authorization existed only as `getCurrentUser()`; a buyer-only guard (`lib/auth/guards.ts`) was added. No dashboard API existed. The root layout rendered the marketplace chrome on every route (see the decision in the design note). The `{buyerId, status}` index did not exist (added for the active count).

Data-quality notes: legacy inquiries carry status `new` (lowercase); the active count includes it. Records written before references existed have no `reference` (the table shows "Not numbered").
