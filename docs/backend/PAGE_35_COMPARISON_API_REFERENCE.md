# Page 35 — Comparison API

Buyer session required for everything except the key list (401 without, 403 for a supplier, 401 for a suspended session); `Cache-Control: private, no-store`; the buyer always comes from the session (a `buyerId` or `userId` in a body or query is ignored). Code: `src/app/api/buyer/compare/**`, `src/lib/compare/`.

| Route | Purpose |
|---|---|
| `GET /api/buyer/compare` | The compared product keys, `max`. Anonymous visitors and suppliers get `authenticated:false` and an empty list (200) so product pages can draw the button state. |
| `GET /api/buyer/compare?view=details` | The comparison: `columns`, `fields`, `emptyLabels`, `notices`, `compatibility {currencyCompatible, unitCompatible, categoryCompatible}`, `capabilities {addToInquiry, saveProduct, removeProduct, clear}`, `min`, `max`. 401 / 403 otherwise. |
| `POST /api/buyer/compare {productId}` | Add: 201, 200 `alreadyAdded`, 404 unknown product, **409 `LIMIT`** at four. 60 / 10 min. |
| `DELETE /api/buyer/compare/{productId}` | Remove one (also a product that left the catalogue, by its stored key). |
| `DELETE /api/buyer/compare` | Clear the buyer's list. |

**Columns:** `key`, `available`, `name`, `url`, image, `code` (the catalogue id; no SKU or brand exists), `supplier {name, url, verified}`, `inquiryHref` (the existing inquiry form), `values`. **Fields (rows):** `key`, `label`, `section` (price, availability, product, supplier, spec, specific), `group`, `status` (same, differs, incomplete; a row nobody states is not returned), `differs`, `highlight` (column keys carrying the neutral "lowest listed" emphasis) and `highlightLabel`. Nothing the client sends influences a price, a specification or a verification: only product keys are accepted (validated against the catalogue), and values are always read from the catalogue.

**Not created:** `/api/buyer/compare-products`, `/validate` and `/bulk`: the PRD says to extend the existing state endpoint rather than duplicate it, and a bulk add would only be a second path past the four-product constraint. Pages: `/buyer/compare-products` (the old `/buyer/compare` redirects with 308).
