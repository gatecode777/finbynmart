# Page 06 — Product Details (`/products/[slug]`)

Tracker ID 05 (owner PRD number 06; see the crosswalk in `PAGE_TRACKER.md`). Reference: `docs/design-references/06-product-details-reference.jpg`. Master references: `DESIGN.md`, `CLAUDE.md`, `PAGE_TRACKER.md`, pages 01–05. Evidence: `docs/page-reports/06-product-details-report.md` and `06-product-details-backend-report.md`.

The page existed (two-column layout, one quote form). Per the standing instruction it was modified, not rebuilt from nothing: the route, the data sources, `RelatedProducts`, the quote API and the shared cards were kept; the layout, gallery, purchase panel, supplier card and tabs were replaced to match the reference. `ProductInfo` and `ProductInquirySection` were superseded and deleted.

## Objective

Show one product with its real facts, let the buyer choose a quantity that respects the minimum order, contact the supplier (quote, inquiry, bulk price), save and share it, and find related products. Everything shown comes from a record; sections without data say so or are hidden.

## Layout and section hierarchy

1. Global header, utility bar and navigation: shared, unchanged.
2. Breadcrumb from the product's real category: Home › Category › Subcategory › Product (Apparel & Fashion products: Home › Apparel & Fashion › Men Tshirts › name; sample listings of the textile page have no subcategory page, so that crumb is omitted).
3. `ProductDetailSection`: three columns from 1100px (gallery | information and actions | supplier and bulk card), two columns on tablets (the supplier column moves below), one on phones.
   - `ProductGallery` (client): main image, thumbnails when there is more than one, full-screen viewer.
   - `ProductPurchase` (client): title, rating (only if the record has one), Share, wishlist heart, price, MOQ, quantity selector, Get Best Quote, Send Inquiry, Request Bulk Price, and the form that opens from the first two.
   - `ProductSupplierCard` and the "Need This in Bulk?" card.
4. `ProductTabs` (client): Product Details, Specifications, Reviews, plus Technical Details, Applications and Documents when the product has them.
5. `RelatedProducts` in the shared `ScrollSlider` with `ProductCard`.
6. `homepage/TrustBenefits`, then the global footer.

## Differences from the reference, on purpose

| Reference | Built | Why |
|---|---|---|
| Bestseller badge, "2,340+ Inquiries", "Inclusive of all taxes", "In Stock" | Not shown | No such data; popularity, inquiry counts, tax and stock claims would be invented |
| Image strip with 6 images, a video and "360° View" | The real single image; thumbnails, count and viewer appear only when there are several; no video or 360 control | One image per product exists; no video or 360 asset exists |
| Supplier card with 10+ years, 500+ products, 98% response rate, 4.8 ratings | Name, initials as the logo, verification only where a record says so, supplier type if known, location, the real product count | Years in business, response rate and supplier ratings are not verified data. No genuine logos exist |
| Description, highlights, 8-row compressor specification table, Technical Details, Applications, Documents, 120 reviews | Description area says none was added yet; specifications are the record's real fields (category, department, colour, sizes, MOQ); Reviews says none are published; Technical, Applications, Documents tabs appear only with data | No such data exists. Specifications are not guessed from the product name |
| Genuine Product / Fast Inquiry Response / Secure & Reliable / After Sales Support strip | The shared homepage benefits strip | Those four claims are not backed by platform policy |
| Product name in a bold sans heading | Same (the global Anton heading style is overridden for the product title) | Matches the reference |

## Product data

One service, `src/lib/catalog/productDetail.ts`, builds a normalised `ProductDetail` for both sources and the API returns the same object. Fields: id, slug, name, url, source, short and full description (null), images (normalised, with alt text), videos, documents, pricing (type fixed, range or estimated; currency INR; unit), MOQ, availability (always null), category and subcategory with links, breadcrumb, specifications `{label, value, unit, group, displayOrder}`, technical details, applications, features, rating (sample listings only), supplier `{id, name, slug, url, productsUrl, initials, city, state, type, verificationStatus, productCount}`. Specification content is never hardcoded per product type: it is built from whatever fields a record has, so a future record with attributes flows through the same structure.

## Price, MOQ and quantity

- Price shows the record's price and unit. Catalog prices are estimates: marked "Est." with "Estimated price: confirm the final price with the supplier". A price range shows both ends. No tax claim.
- MOQ shows the record's MOQ and unit ("10 Pieces"). When there is none: "MOQ: not specified by the supplier" and "No minimum order is listed for this product"; it is never read as 1 or 0.
- Quantity selector: minus, number input (digits only, up to 7 digits), plus. It starts at the MOQ (or 1) and cannot go below it with the buttons; typing a lower number shows "The minimum order is 10 pieces." (Also: whole numbers only, 1 to 1,000,000, and the unit must be the product's own unit.)
- The same rules (`src/lib/catalog/quantity.ts`) run on the server in `POST /api/inquiries`; the browser value is never trusted.

## Actions

- **Get Best Quote** and **Send Inquiry** open one form under the buttons (`#get-best-quote`). Quote: message optional. Inquiry: a question of at least 10 characters. Both create a record in `inquiries` (type `quote` or `inquiry`) for this product and its own supplier, resolved on the server; success is shown only with the stored reference. Signed-out visitors are told to sign in and nothing is stored. Links such as `/products/<slug>#get-best-quote` (used by every product card) and `#send-inquiry` open the matching form on load.
- **Request Bulk Price** opens `/post-requirement` with the product, category, subcategory, and the quantity and unit chosen; the form is prefilled and stores a real requirement.
- **Share** uses the native share sheet when the browser has one; otherwise it copies the link and says "Link copied", and if the browser refuses it says "Couldn't copy the link" (no false success).
- **Heart** saves to `wishlists` (signed-out visitors go to sign in) and shows the saved state from the server.
- **All Products by Supplier (N)** opens `/products?seller=<slug>` (Page 05's list limited to that supplier, same count). Page 10 will give suppliers their own product page.

## Gallery behaviour

Next/image with `sizes`, the first image prioritised, remote dataset photos unoptimised. Thumbnails (vertical beside the image from 640px, a row below on phones) with `aria-current`; the expand button opens a modal viewer (Escape closes, arrow keys move, backdrop click closes, focus returns to the opener, page scroll locked). A photo that fails to load is dropped; with none left the neutral "Photo not available" tile shows. Zoom is the full-screen viewer; there is no pixel-level zoom.

## Tabs

Roving tabindex, `role=tablist/tab/tabpanel`, arrow keys, Home and End. One rule for empty content: Product Details, Specifications and Reviews always exist and explain an empty state; Technical Details, Applications and Documents appear only with data. On phones the tab row scrolls sideways.

## Related products

Transparent category matching, no scores: same subcategory first (catalog: the same product category), then the same department (catalog) or the rest of the category page (sample). The product itself is never included; up to 8; the section is hidden when there are none (a sample product that is alone in its category has none).

## Routing

`/products/<slug>`: catalog slugs are `<name>-<id>`; any text before a real id redirects (308) to the canonical slug; sample listings use their id; anything else is a real 404 (`app/not-found`). No `loading.tsx` (the route can 404 and redirect).

## SEO

Title "{product} — {supplier} | Finbyn Mart", description with supplier and place, canonical and Open Graph URL/image when the site origin is configured (`NEXT_PUBLIC_SITE_URL`), `BreadcrumbList` and a minimal `Product` (name, sku, category, image). No `offers`, price, rating or availability is published in structured data: catalog prices are estimates and sample values are placeholders.

## Responsive behaviour

Phone: gallery, then information (actions one per row below 420px, two columns above), supplier and bulk cards stacked, tab row scrolls, related cards in the slider. Tablet (768px+): two columns, supplier and bulk side by side below. Desktop (1100px+): three columns. Touch targets are at least 44px (steppers, actions, links).

## States

Not found (real 404), image fallback, empty tabs, no related products (section hidden), sign-in prompt, validation messages, send errors with the server's message. Error boundary is the global one.

## Acceptance

See the report for what was run: 69 scripted checks on the page and APIs, plus the updated backend and regression suites.
