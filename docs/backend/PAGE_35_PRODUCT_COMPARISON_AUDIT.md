# Page 35 — Product comparison: pre-build audit

Audit date 2026-11-05. Page 35 is the PRD for a page that already existed (Compare Products, tracker ID 102, built earlier from the sidebar item alone). It was **extended, not rebuilt**: the `compare_items` collection, the API, the add / remove / clear flows and the Compare buttons were kept. The route moved to the PRD's `/buyer/compare-products`; the old `/buyer/compare` permanently redirects (308).

## What existed

| Area | Finding |
|---|---|
| State | `compare_items` (`userId`, `productKey`, `productName`, `addedAt`, `slot`): one list per buyer, at most 4, unique per product, a unique (userId, slot) index that makes a fifth product impossible even under a race. Buyer only. |
| API | `GET /api/buyer/compare` (keys; anonymous and suppliers get `authenticated:false`), `GET ?view=details`, `POST`, `DELETE`, `DELETE /{productId}`. Rate limit 60 / 10 min. |
| Page | Table from 900 px, cards below; remove one, clear all (both confirmed); Differs marks; notices; the Compare button on product pages and saved-product cards. |
| Product data | One central repository (`getPublicProductByKey`): name, slug, id, images, price (min, max, currency INR, unit, type fixed / range / estimated), MOQ (sample listings only), category, subcategory, structured `specifications` (`{label, value, unit, group}`), rating (sample listings only), supplier (name, location, type, verification, profile). |
| Not in the data | **SKU and brand** (the catalogue has neither: the product id is its code), **availability** (always null: no stock or availability data), **lead time, certifications, warranty** (none), **supplier logos** (none), genuine **supplier ratings** (none), bulk-price tiers, historical prices, offers and discounts, price-on-request, country of origin. |
| Category specification registry | **None exists.** The data carries each attribute's own `group`; there is no per-category list of required attributes. |
| Currencies | Only INR exists in the data; units vary (a catalogue product is per Piece, sample listings have their own unit). |
| Inquiry | The existing inquiry form `/inquiry/{supplierSlug}?product={slug}` (Page 13), one supplier at a time. |

## What was added in this page

Selected-product chips; header actions Back to Saved Products, Add More Products (to the Product Explorer, disabled at four) and Clear All; "Compare Products (n)" heading with the PRD description; per-column header (image, name, **product code**, supplier with verification, category); rows grouped into sections (Price & order, Product, Supplier, each specification group, Specific to one product); **Highlight differences** and **Show differences only** controls; neutral **lowest listed price / minimum order** emphasis only when currency and unit match; a **compatibility** block and **capabilities** in the API answer; rows nobody has data for are **not drawn** and listed as not available; per-column **Add to Inquiry, View Product, Save Product (shared wishlist), Remove**; a sticky criteria column and a keyboard-focusable named scroll region; a round **Compare** button on every product card of the Product Explorer, category and search pages (top-left of the picture).

## Status of each PRD feature

| Feature | Status |
|---|---|
| State, add, remove, clear, limit of four, duplicate refused, persistence across navigation and refresh | Built (earlier) and retested |
| Product summary (image, name, code, supplier, verification, category) | Built; **SKU, brand, supplier logo BLOCKED** (no data) |
| Price, unit, MOQ comparison with compatibility rules | Built; **bulk tiers, offers, discounts, price history, price-on-request BLOCKED** (no data) |
| Specifications, category-aware | Built from each attribute's own group; **no category registry exists** (see `PAGE_35_CATEGORY_ATTRIBUTE_REGISTRY.md`) |
| Availability, lead time, certifications, warranty | **BLOCKED**: no data; shown as "not available for these products", never as guessed values |
| Supplier rating | **BLOCKED**: none; the Rating row appears only for sample listings that carry a rating |
| Difference highlighting | Built |
| Add to Inquiry | Built (one supplier's form per product; nothing is submitted automatically) |
| Save Product, View Product | Built (shared wishlist button; product page link) |
| Add More Products | Built (Product Explorer with the Compare button on every card) |
| Separate `/api/buyer/compare-products` routes, `/validate` and `/bulk` | Not created: the existing `/api/buyer/compare` routes are the state API (the PRD says to extend an existing endpoint, not duplicate it) |

## Gaps

The comparison is computed for at most four products per request from the in-memory catalogue; the only database reads are the buyer's own rows (index `buyer_compare_order`). Pricing is the catalogue's estimated price, labelled as an estimate.
