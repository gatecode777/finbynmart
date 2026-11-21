# General requirement (Post Your Requirement) on the canonical inquiry model

Status: Development **Implemented**; runtime **BLOCKED** (no isolated database: `it-requirement-flow.mjs` is prepared, not run). Implemented is not runtime verified, and runtime verified is not ready for launch.

## Existing flow (before) and final flow
**Before.** `/post-requirement` (and the homepage strip) posted free text (product name, quantity, city) to `/api/requirements`, which wrote the `requirements` collection. Nothing read that collection (no buyer page, supplier page, admin page or worker), so the form was a dead end. The working lead path existed only for product inquiries (`/inquiry/[supplier]` -> `submitInquiry` -> DIRECT + MATCHED).

**Final.** The buyer searches the public catalogue (the existing `/api/public/products` engine, 10 results, debounced, cancellable) and picks ONE catalogue product that best describes the need. `POST /api/requirements` validates and stores ONE canonical inquiry through the same `submitInquiry` (inquiry + durable `distribution_jobs` row in one transaction): `sourceType: "GENERAL_REQUIREMENT"`, `supplierKey: ""`, `supplierName: ""`, `inquiryType: BULK_REQUIREMENT`, the reference product's key/name/category, quantity in the product's own unit, delivery city, optional `requiredBy`, optional description. The existing worker (`runDistribution`) creates MATCHED recipients by policy `match-1` (same category, name and colour as the reference product). Everything downstream is unchanged: buyer list and detail, supplier Matching leads, private conversations, quotations, comparison, notices.

## DIRECT versus GENERAL
| | Direct product inquiry | General requirement |
|---|---|---|
| Entry | `/inquiry/[supplier]` ("Send Requirement") | `/post-requirement` |
| Selected supplier | the one the buyer chose (`supplierKey`, provenance) | none (empty); nobody is ever labelled "Selected supplier" |
| Recipients | that company DIRECT, others MATCHED | only MATCHED, including the reference product's own supplier when it passes the same eligibility |
| Buyer label | the inquiry type | "General Requirement"; supplier column "Matching suppliers"; responders "Matching supplier" |
| Supplier label | "Direct" | always "Matched" (kind comes from key membership, never a stored label) |

## Rules enforced on the server
Registered buyer only (`requireBuyerApi`; no guest fan-out), origin check, rate limit (10 / 10 min, well-formed submissions only), per-form idempotency key (a retry or double click is one requirement; a repeat with a new key within 10 minutes is refused as a duplicate), body bounds. Product: must resolve to a public CATALOGUE product (supplier-created and sample products cannot drive matching: reported as a validation error, never matched loosely). Quantity: whole number, unit forced to the product's own unit (no conversion). Required-by: optional real date, not past, within two years. Description: optional, 10 to 1,000 characters. Buyer, supplier (none), category, status and source type are never read from the request. Matched suppliers see only the requirement DTO (product, quantity, delivery city, required-by, the description); no phone, e-mail, address, account id or other recipient. Attachments do not exist and are not offered.

## What the buyer sees
The notice "Select the product that best describes your requirement. Your requirement will be shared with eligible matching suppliers." (no checkbox), inline field errors, an honest "No matching product available" state with links to browse products, categories and contact (nothing is saved without a product), and after saving the real reference and distribution state ("Processing" first). Nothing claims delivery. Signed-out submit shows the sign-in prompt and the entered values survive the detour (this tab only). The homepage strip only starts a requirement: "Continue" opens `/post-requirement` prefilled, because a structured requirement needs a chosen product.

## Legacy `requirements` records
The old collection is no longer written. Existing rows (free-text product, optional supplier) cannot be matched exactly and are **not** redistributed, notified or deleted. Read-only assessment: `docs/audits/tools/requirements-legacy-dryrun.mjs` (refuses to run without `LEGACY_ASSESS_URI`, `LEGACY_ASSESS_DB`, `LEGACY_ASSESS_CONFIRM=read-only`; counts only; no fallback to the ordinary variables). Not executed. A backfill needs an approved policy (map each row to a catalogue product with the buyer's confirmation, keep ownership and `createdAt`, send no supplier notices).

## Worker and configuration
Unchanged: `POST /api/internal/distribution` with `DISTRIBUTION_WORKER_SECRET` and a scheduler (none deployed, not verified). Without it the best-effort pass after the response runs and the requirement shows "Processing". Closing (cancelling) a requirement stops distribution that has not finished (checked before each recipient).

## Known limits
Only apparel catalogue products (CSV) can be reference products; approved supplier products are not matched; the colour of the chosen product is part of the requirement (to want another colour, pick that product); the selector searches the Apparel & Fashion catalogue only; with the database unreachable the public product API waits for the rate limiter (about 16 s in this environment) before answering.
