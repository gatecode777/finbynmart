# Saved Products — audit, data and API

## Audit (2026-11-04)
| Area | Finding |
|---|---|
| Storage | Collection `wishlists`: `{ userId, productKey, productName, addedAt }`, unique `{userId, productKey}` (one row per buyer and product). `productKey` is a catalogue product id (numeric) or a sample listing slug. |
| Existing API | `GET /api/buyer/wishlist` (saved keys; anonymous gets `authenticated:false`), `POST /api/buyer/wishlist { productId }` (resolves the product on the server, 60 / 10 min), `DELETE /api/buyer/wishlist/[productId]`. The heart buttons on product cards use them (`WishlistButton`). |
| Product details | `getPublicProductByKey` (name, images, price, supplier, category) from the in-memory catalogue. No per-product DB query is needed. |
| Missing | A list endpoint with details, filters, sort and paging; a newest-first index (the only index was the unique one); a limit (nothing stopped a buyer saving without end); a page. No compare feature. |

## Decisions
1. Reuse `wishlists`; add **no** collection. The reference's `saved_products` would duplicate it.
2. New index `buyer_saved_newest {userId, addedAt:-1, _id:-1}`: the list reads the buyer's rows newest first without a sort stage (verified with `explain`: IXSCAN, no SORT).
3. Cap **500 saved products per buyer** (`SAVED_CAP`): it bounds the read and the page build. The 501st save is refused (409); saving one that is already saved is still harmless (200).
4. Category is not stored: it is derived from the catalogue when listing (as the dashboard does); nothing is guessed. Filtering, sorting and paging run in memory over the buyer's at most 500 rows after the indexed read.
5. A product that left the catalogue is shown as unavailable, never silently dropped.

## API
`GET /api/buyer/saved-products?q=&category=&sort=&page=&limit=` (buyer session required: 401 / 403 for suppliers; `private, no-store`; a `buyerId` parameter is never read).
- `q` ≤ 60 characters (matches product or supplier name, case-insensitive, as plain text); `category` a slug; `sort` one of recent, oldest, name, name-desc, price-low, price-high; `page` 1–100; `limit` 1–48 (default 12). Invalid: 400 with `fields`.
- Answer `{ ok, data: { items[], categories[{id,name,count}], totalSaved, totalMatchingSearch, total, page, limit, totalPages }, meta }`. An item: `key`, `savedAt`, `available`, `name`, `url`, `imageSrc`, `imageRemote`, `shortDescription`, `category {id,name}`, `price {text, unit}`, `supplier {name, url, verified, inquiryHref}`; unavailable items have only `key`, `savedAt`, `name`. Never a user id, contact data or internal field.
- Save and remove: the existing wishlist routes (unchanged contract; `POST` now also answers 409 at the cap).

## Security
Every query starts from `userId` of the session; removing a key the buyer has not saved removes nothing (`removed:false`) and cannot touch another buyer's row (the delete names the buyer). Operator-looking input is plain text or ignored. Rows hold no personal data.

## Performance (500 saved products, the cap; production build, remote shared cluster, 25 samples, p95)
List 146 ms (a first run measured 279 ms), category filter 135–147, search 136–137, price sort 131–136, last page 138–141; a 12-card page is 8.5 KB; ten simultaneous requests 548–611 ms in total. All below the 400 ms target for filtered/paginated lists. The cost is resolving the buyer's saved keys against the catalogue on each call (no per-row database query); a buyer below the cap is faster.
