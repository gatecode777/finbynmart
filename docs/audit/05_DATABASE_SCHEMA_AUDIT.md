# 05 — Database Schema Audit

Two data stores exist. Neither was modified.

## 1. MongoDB (live, `finbynmart` database)
Only one collection is used by code: **`users`** (`src/lib/auth/users.ts`).

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name`, `email` (lower-cased), `passwordHash` (`salt:hash`), `role` (`buyer`\|`supplier`), `createdAt` | | |
| `supplier` | `{businessName, phone, city, offering}` | Embedded; only for suppliers |

Indexes: unique `email`. No schema validation (`$jsonSchema`) on the collection; validation is application-level. No soft delete, no `updatedAt`, no email-verified flag, no last-login, no failed-login counter.
Test accounts created during development (`authtest…@example.com`, `supauthtest…@example.com`) may still exist in the live collection — **unverified, needs cleanup**.

## 2. Catalog (file-based, test data)
`db/schema.sql` (portable SQL) and CSV seeds in `db/seed/`; the app reads the CSVs, not SQLite.

| Table | Rows (from CSV) | Notes |
|---|---:|---|
| sellers | 1,200 | Fictional; contact fields exist in the file but are never read by the app |
| categories | 118 | |
| products | 21,392 | Kaggle/Myntra research dataset; **prices and sizes are estimated**; images hotlinked |
| product_sizes | 90,537 | |
| seller_product_counts | view | |

Relationships: seller→products, category→products, products→sizes via ids in the CSV; there are no enforced foreign keys at runtime because the files are in-memory arrays.

## Entity-by-entity checklist (brief's list)
Legend: ✅ exists and verified · ◐ partial · ❌ missing

| Entity | Status | Notes |
|---|---|---|
| Users | ◐ | Single collection, minimal fields |
| Roles / Permissions | ❌ | Only a `role` string, two values |
| Buyer profiles | ❌ | |
| Supplier profiles | ◐ | Embedded in `users`; separate catalog `sellers` are unrelated to real accounts |
| Companies | ❌ | |
| Supplier verification | ❌ | |
| Categories / Subcategories | ◐ | Catalog categories only (CSV); sample categories in constants for the category pages; no hierarchy table in Mongo |
| Products | ◐ | CSV test data only; no supplier-owned products |
| Product images / attributes / inventory | ◐ | Image URL and sizes in CSV only |
| Locations | ❌ | City/state are free strings |
| Requirements | ❌ | |
| Inquiries, inquiry messages | ❌ | |
| Quotations, quotation items, negotiations | ❌ | |
| Saved suppliers, wishlist | ❌ | |
| Reviews and ratings | ❌ | Ratings shown are sample values |
| Subscription plans, supplier subscriptions | ❌ | |
| Orders, payments, invoices, transactions, refunds, commissions | ❌ | |
| Notifications, email logs | ❌ | |
| Audit logs | ❌ | |
| Support tickets | ❌ | |
| CMS content, banners, campaigns | ❌ | All content is in code constants |

Counts: 20+ expected entities; 1 persisted entity; 2 partially modelled; the rest missing.

## Findings
| ID | Finding | Severity |
|---|---|---|
| D1 | Only `users` is persisted; every marketplace entity is missing | Critical for production readiness |
| D2 | Catalog is not in the production database; the in-memory CSV seam (`data.ts`) must be replaced | High |
| D3 | No company entity, so supplier data cannot be shared, verified or linked to products | High |
| D4 | No `$jsonSchema` validation, no audit fields (`updatedAt`, `deletedAt`) | Medium |
| D5 | Dev/test users may remain in production data | Low |
| D6 | Dataset licence (research use) vs. a public repo containing `db/seed/products.csv` | Legal/compliance review needed |
| D7 | Sensitive fields: `passwordHash` is stored hashed and never returned (`toPublicUser`). Good. | — |
