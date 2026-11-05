# Page 06 backend audit (Product Details)

Written before the implementation, 2026-11-02, from the repository after Page 05.

## What exists and was reused

| Area | Finding | Use |
|---|---|---|
| Product model | No product collection. Catalog products (`CatalogProduct`: id, slug `<name>-<id>`, name, colour, category, department, estimated price, sizes, one image URL, seller id) and sample listings (`B2BProduct`: id slug, price or range, price unit, MOQ and MOQ unit, supplier fields, supplier type, verified flag, rating, one image) | Kept; normalised into one DTO |
| Slug structure | Catalog: `<slugified name>-<numeric id>`, canonical by id (the page redirected a wrong prefix already). Sample: the listing id | Same rules, now through `getPublicProductBySlug` |
| Categories | Main category directory and category records (`categories.ts`); catalog subcategory = product category name | Breadcrumb and related products |
| Supplier model | Catalog sellers (name, slug, city, state, specialization, rating, joined date, product count); sample suppliers inside listing records. No logo, business type, years in business, verification, response rate, contact in public data | Public supplier object limited to approved facts |
| Images | One image per product; no gallery, caption, video or 360 data; no ImageKit | `normalizeImage()` from Page 05; gallery supports many images but the data has one |
| Specifications | None as a structure. Real fields only: category, department, colour, sizes (estimated), MOQ | Normalised `{label, value, unit, group, displayOrder}` built from real fields |
| Description, features, applications, documents, technical details | **Absent everywhere** | Empty lists and honest empty states |
| Availability, popularity, inquiry counts | Absent | Not shown |
| Reviews | **No reviews collection, submission or moderation**; sample listings carry a rating number and a review count without any review text | Reviews API answers empty with `supported: false`; the page says none are published |
| Wishlist | `wishlists` + `/api/buyer/wishlist*` (ownership, unique index) | Reused unchanged |
| Inquiry / quote | `inquiries` + `POST /api/inquiries` (supplier resolved server side, duplicate window, rate limit); the product page had a quote form | Extended: product MOQ/unit validation, `type` field |
| Requirement | `requirements` + `POST /api/requirements`; `/post-requirement` read product, category, subcategory | Extended: quantity and unit prefill |
| Auth | Signed cookie session; no roles enforced | No change |
| Rate limit | MongoDB counter | Reused for the new public GET endpoints |
| FAQs | No FAQ data | `/faqs` endpoint **not created** |

## Missing functionality

Product record fields: description, highlights, specifications beyond the few real ones, technical details, applications, documents, videos, 360 media, availability, brand, dates. Reviews system (collection, submission, moderation, verified-purchase proof). Supplier public profile fields (logo, business type, years in business, response rate). A products collection with status and approval fields (visibility rules from the PRD cannot be exercised: nothing is draft, rejected, suspended or deleted).

## Data problems

1. Sample ratings and review counts exist without review texts; showing "120 reviews" with an empty list would mislead, so only the rating is shown and the Reviews tab says none are published.
2. MOQ exists only on sample listings; catalog products have none. The PRD forbids reading a missing MOQ as 1.
3. Prices on catalog products are estimates by product type.
4. Sample suppliers' profile pages may not exist for every sample supplier (`/suppliers/<slug>`); the supplier links on sample products depend on Page 09's work.
5. The old quote form offered units unrelated to the product (Pieces, Meters, Kg, Sets, Boxes, Rolls for any product) and accepted any quantity.

## Required changes (done)

Quantity/MOQ/unit validator shared by browser and server; `ProductRef` gained the product's price unit and MOQ; `inquiries.type`; product detail service and DTO; three public GET endpoints; gallery, purchase panel, supplier card and tab components; requirement prefill.

## Security risks identified

Client-supplied quantity, unit or supplier trusted (fixed: server derives supplier, unit and MOQ from the product); path-like slugs (rejected before any lookup); overly large or malformed inputs; private data in the DTO (allow-list DTO, no contact fields are ever loaded); false success messages on send or copy (success only from the server or a resolved clipboard promise).

## Dependencies

Reviews, product attributes, documents and media need new data sources before those sections can fill. Role enforcement and moderation are needed before review submission can be built safely.
