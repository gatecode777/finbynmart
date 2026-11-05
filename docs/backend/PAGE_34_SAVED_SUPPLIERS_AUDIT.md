# Page 34 — Saved Suppliers: pre-build audit

Audit date 2026-11-04. Page 34 is the PRD for a page that already existed (`/buyer/saved-suppliers`, tracker row 31, built earlier from the sidebar item alone). Per the owner's rule the page was **modified, not rebuilt**: its data flow, routes, the shared save routes and the shared components were kept. This audit compares the PRD with the repository as it was before this work.

## What existed

| Area | Finding |
|---|---|
| Saved-supplier relationship | `wishlist_suppliers` (`userId`, `supplierKey`, `supplierName`, `addedAt`), unique (userId, supplierKey), a newest-first index, a 500-supplier cap. Written by `POST /api/buyer/wishlist/suppliers`, removed by `DELETE …/[supplierId]`: the same two routes serve the hearts on supplier cards, the profile's Save Supplier button and this page (one shared client store). |
| Page | List, category tabs, search, 4 sorts, pagination, per-supplier removal with confirmation; card with initials badge, location, product count, profile / inquiry links. |
| Supplier data | **No `companies`-style supplier collection.** Suppliers are a read-only seed: 1,062 fictional catalogue sellers (`db/seed/sellers.csv`, "Active" ones only) and a handful of sample suppliers (`src/lib/constants`). Per supplier the data holds: name, city, state (no country), a main category, products, a member-since year; sample suppliers also a type, a "verified" flag and (one) a written description. The `companies` collection that exists is the **buyer's** company (Page 23). |
| Verification | No verification workflow, records or reviewer states. "Verified" exists only as a flag on sample supplier records; catalogue sellers are never verified. |
| Logos, banners | None. The only supplier images are product photos, which the PRD forbids using as a logo. |
| Ratings, reviews | None for suppliers. `sellers.csv` has a `rating` column, but it is research/test data, not customer feedback, and is not shown. |
| Contact / messaging | No buyer-supplier messaging. The existing **inquiry form** (`/inquiry/[supplierSlug]`) is the contact channel; it takes one supplier at a time. No multi-supplier inquiry. |
| Supplier comparison | None (Compare Products compares products only). |
| Bulk operations | None. |

## What was built (extending the existing page)

Summary cards and filter choices (`GET …/summary`); filters for category, state, city, supplier type and verification; sorts Most Products and Most Categories; Grid and List views; selection (max 20) with Select All on the page; **Remove Selected** (`POST …/bulk-remove`), **Clear All** (`DELETE /api/buyer/saved-suppliers`, confirmed, audited); **Compare Selected** (new `/buyer/compare-suppliers` page and `POST …/compare`, 2 to 4 of the buyer's own saved suppliers); **Contact Supplier** and **Add to Inquiry** via the existing inquiry form; live per-supplier facts (type, description, categories, counts) in the list; `categoryCount` added to the shared public supplier DTO.

## Status of each PRD feature

| Feature | Status | Why |
|---|---|---|
| List, save, remove, search, category / state / city / type / verification filters, sorting, grid and list, pagination | Built | |
| Summary: Total Saved, Verified, Active, Product Categories | Built | live counts |
| Summary: **Countries** | Replaced by **States** | No supplier record stores a country, and a country is never inferred from a name or phone number |
| Bulk remove, Clear All, selection | Built | |
| Compare Selected | Built | supported criteria exist (type, verification, categories, counts, location, member-since); no ranking |
| Contact Supplier | Built as a link to the **inquiry form** | no messaging module |
| Add to Inquiry | Built for **one** selected supplier | multi-supplier inquiry is not supported by the inquiry system |
| Supplier **logos and banners** | **BLOCKED** | no company media exists; a neutral initials badge is shown |
| **Ratings and reviews**, "Highest Rating" sort | **BLOCKED** | no genuine data |
| Verification **Pending / Rejected** filter states | **BLOCKED** | no workflow |
| Supplier status changes (suspended, unlisted) | Partly | the only status in the data is "in the catalogue or not": a supplier that left is shown unavailable with no actions |
| Notes on saved suppliers | Not built | optional in the PRD; no UI asked for it |
| Public contact permissions, website | Not shown | none configured in the data |

## Gaps found

The list reads at most 500 rows and builds each supplier's facts in memory (memoised per supplier, bounded), so the cost is proportional to the saved count, not the catalogue. Aggregates (categories, states) are computed in the application from those rows rather than in MongoDB, because the supplier facts live in the catalogue seed, not in the database.
