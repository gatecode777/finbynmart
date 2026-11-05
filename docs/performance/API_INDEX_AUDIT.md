# MongoDB index audit

Method: `docs/performance/tools/mongo-explain.mjs` loads synthetic documents into the **throwaway** database `finbynmart_test` only, runs `explain("executionStats")` for each query the application issues against MongoDB (copied from the code), at three data volumes, and removes the synthetic data. The product catalogue is **not** in MongoDB (it is CSV held in memory), so none of these indexes concern catalogue queries.

Collections the application uses: `users`, `inquiries`, `reviews`, `certifications`, `wishlists`, `wishlist_suppliers`, `requirements`, `rate_limits`.

### 1,000 reviews, 250 certifications, 2,000 inquiries

| Query (as the application runs it) | returned | keys examined | docs examined | server ms | plan type | winning plan |
|---|---:|---:|---:|---:|---|---|
| reviews: public list of one supplier (as the app runs it: up to 2000, allow-listed fields) | 113 | 114 | 114 | 0 | index | `LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN(supplierSlug_1_status_1_publishedAt_-1)` |
| reviews: headline (ratings only) | 113 | 114 | 114 | 0 | index | `LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN(supplierSlug_1_status_1_publishedAt_-1)` |
| reviews: a buyer's own review of one supplier | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_supplierSlug_1)` |
| reviews: a buyer's list, newest first | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| certifications: public list of one supplier (up to 500) | 53 | 56 | 54 | 0 | index | `LIMIT > FETCH > IXSCAN(supplierSlug_1_verificationStatus_1)` |
| inquiries: by reference (confirmation page) | 1 | 1 | 1 | 0 | index | `EXPRESS_IXSCAN(reference_1)` |
| inquiries: by idempotency key (retry check) | 1 | 1 | 1 | 0 | index | `EXPRESS_IXSCAN(idempotencyKey_1)` |
| inquiries: buyer's list, newest first (limit 100) | 40 | 40 | 40 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| inquiries: buyer duplicate check (supplier, product, quantity, last 10 minutes) | 0 | 1 | 1 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| inquiries: guest duplicate check (same email, supplier, quantity, last 10 minutes) | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(guest.email_1_createdAt_-1)` |
| inquiries: a supplier's newest (for the supplier inbox, not built yet) | 20 | 20 | 20 | 0 | index | `LIMIT > FETCH > IXSCAN(supplierKey_1_createdAt_-1)` |

### 10,000 reviews, 2,500 certifications, 20,000 inquiries

| Query (as the application runs it) | returned | keys examined | docs examined | server ms | plan type | winning plan |
|---|---:|---:|---:|---:|---|---|
| reviews: public list of one supplier (as the app runs it: up to 2000, allow-listed fields) | 1013 | 1014 | 1014 | 3 | index | `LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN(supplierSlug_1_status_1_publishedAt_-1)` |
| reviews: headline (ratings only) | 1013 | 1014 | 1014 | 3 | index | `LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN(supplierSlug_1_status_1_publishedAt_-1)` |
| reviews: a buyer's own review of one supplier | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_supplierSlug_1)` |
| reviews: a buyer's list, newest first | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| certifications: public list of one supplier (up to 500) | 439 | 442 | 440 | 1 | index | `LIMIT > FETCH > IXSCAN(supplierSlug_1_verificationStatus_1)` |
| inquiries: by reference (confirmation page) | 1 | 1 | 1 | 0 | index | `EXPRESS_IXSCAN(reference_1)` |
| inquiries: by idempotency key (retry check) | 1 | 1 | 1 | 0 | index | `EXPRESS_IXSCAN(idempotencyKey_1)` |
| inquiries: buyer's list, newest first (limit 100) | 100 | 100 | 100 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| inquiries: buyer duplicate check (supplier, product, quantity, last 10 minutes) | 0 | 1 | 1 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| inquiries: guest duplicate check (same email, supplier, quantity, last 10 minutes) | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(guest.email_1_createdAt_-1)` |
| inquiries: a supplier's newest (for the supplier inbox, not built yet) | 20 | 20 | 20 | 0 | index | `LIMIT > FETCH > IXSCAN(supplierKey_1_createdAt_-1)` |

### 50,000 reviews, 12,500 certifications, 1,00,000 inquiries

| Query (as the application runs it) | returned | keys examined | docs examined | server ms | plan type | winning plan |
|---|---:|---:|---:|---:|---|---|
| reviews: public list of one supplier (as the app runs it: up to 2000, allow-listed fields) | 2000 | 2001 | 2001 | 20 | index | `LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN(supplierSlug_1_status_1_publishedAt_-1)` |
| reviews: headline (ratings only) | 2000 | 2001 | 2001 | 8 | index | `LIMIT > PROJECTION_SIMPLE > FETCH > IXSCAN(supplierSlug_1_status_1_publishedAt_-1)` |
| reviews: a buyer's own review of one supplier | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_supplierSlug_1)` |
| reviews: a buyer's list, newest first | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| certifications: public list of one supplier (up to 500) | 500 | 502 | 501 | 1 | index | `LIMIT > FETCH > IXSCAN(supplierSlug_1_verificationStatus_1)` |
| inquiries: by reference (confirmation page) | 1 | 1 | 1 | 0 | index | `EXPRESS_IXSCAN(reference_1)` |
| inquiries: by idempotency key (retry check) | 1 | 1 | 1 | 0 | index | `EXPRESS_IXSCAN(idempotencyKey_1)` |
| inquiries: buyer's list, newest first (limit 100) | 100 | 100 | 100 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| inquiries: buyer duplicate check (supplier, product, quantity, last 10 minutes) | 0 | 1 | 1 | 0 | index | `LIMIT > FETCH > IXSCAN(buyerId_1_createdAt_-1)` |
| inquiries: guest duplicate check (same email, supplier, quantity, last 10 minutes) | 0 | 0 | 0 | 0 | index | `LIMIT > FETCH > IXSCAN(guest.email_1_createdAt_-1)` |
| inquiries: a supplier's newest (for the supplier inbox, not built yet) | 20 | 20 | 20 | 0 | index | `LIMIT > FETCH > IXSCAN(supplierKey_1_createdAt_-1)` |


Reading the tables: "docs examined" far above "returned" means the index is not selective for that query; **COLLSCAN** means no index was used; **blocking SORT** means MongoDB sorted in memory. See the end of this file for the findings and what was changed.
