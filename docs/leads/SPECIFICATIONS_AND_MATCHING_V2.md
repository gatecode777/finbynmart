# Structured specifications and matching policy `match-2`

Status: Development **Implemented**; runtime **BLOCKED** (no isolated database: `it-specifications-flow.mjs` is prepared, not run). Implemented is not runtime verified, and runtime verified is not ready for launch. Matching is **not declared complete**: only one category has specification definitions (see coverage).

## Attribute definitions (`src/lib/catalog/attributes.ts`)
One pure, client-safe file shared by the supplier form, the requirement form, the server and the tests. An attribute set belongs to a MAIN category; a category with no set has **no specification fields**, its supplier products carry no attributes, receive no defaults and cannot be matched automatically.

| Set | Main categories | Attributes (id, type, required, matching) |
|---|---|---|
| `textile` | `apparel-fashion` (all its sub-categories) | `type` enum, required, equal (fabric, t-shirt, shirt, trousers, jacket, dress, uniform, other); `composition` enum, required, equal (cotton, polyester, viscose, linen, wool, silk, nylon, two blends, other); `colour` text 2-30 letters, required, normalised equality; `gsm` number 20-1000, 0 decimals, optional, range ±10%; `width` number 10-400 cm, 1 decimal, units cm or inch (factor 2.54), optional, range ±3% after conversion; `weave` enum optional equal; `finish` enum optional equal |

**Coverage limits.** Every other main category (industrial machinery, electrical, home, packaging, food, health, agriculture, construction, chemicals) has no definitions yet, so products there get no specification fields, and a requirement referencing them is refused with a clear message. Adding a category means adding a set and a `CATEGORY_SET` entry; no portal or migration is needed. Attribute values are never inferred from titles or images; an unfilled optional attribute stays absent.

## Where specifications live
Supplier form (existing Add/Edit page, a Specifications group under Product information, shown only for categories that have a set) -> `draft.attributes` (validated, typed) -> submitted review snapshot (copied from the draft at submit) -> `publication.snapshot.attributes` (copied from the review snapshot at approval; approval re-validates them against the category and refuses an invalid set) -> the public loader re-validates again and drops an invalid set whole. Editing a draft writes only `draft.*`, so a pending edit never changes live content. The admin review screen shows the exact submitted specifications. Cards show at most three (priority: composition, GSM, width, colour...), the product detail shows all of them in the existing specification section. A pending legacy submission in a category with a set, made before this change, carries no attributes and cannot be approved until the supplier resubmits (no defaults are invented).

## Matching policy `match-2` (versioned; recorded on every job)
A job keeps the policy it was created under; historical jobs (`match-1`, no `kind`) are processed by the catalogue rule exactly as before and are **never** re-matched under a newer policy. `requirement.kind` selects the family:
- **CATALOGUE_EXACT**: catalogue listings, unchanged (same category + department + product type, same normalised name, same colour when stated). The catalogue carries no structured attribute beyond colour, so this is its only reliable evidence.
- **SUPPLIER_ATTRIBUTES**: approved supplier products only. Candidates are public eligible products of the same main category; **every attribute the requirement states** must be present and compatible: enumerations by approved value equality (an option flagged "other" never matches, not even itself), numbers by the documented tolerance in the base unit after a defined conversion, text by normalised equality. A candidate missing a stated attribute is not a match; unlike or unknown units are never compared. Product `type` is itself a required attribute, so "same name and category" is never enough.
- The two families never match each other: there is no canonical type mapping between a catalogue listing and a supplier product, and none is guessed.
One lead per company (lowest product id recorded, sorted by company id), the selected supplier's company excluded for a direct inquiry (also when a catalogue seller is linked to it), eligibility rechecked inside each recipient transaction (company ACTIVE, owner of that identity, product still public), bounded batches, cursor resume, closure stops it. Seller aliases are never auto-linked and ownership is never changed.

## Requirement flow
The selector now lists catalogue products and approved supplier products (still limited to Apparel & Fashion, the only category with valid definitions). On choosing a product the form loads its specifications from `GET /api/public/requirement-spec` and, for a supplier product, shows them editable; whatever the buyer changes becomes the authoritative `inquiry.requirement` snapshot (category node, attributes, policy) and the matching criterion. The server validates every submitted attribute against the category's set; unknown attributes are refused; a product from an unsupported category is refused. A catalogue product shows its colour read-only (no other attribute exists). The inquiry type, DIRECT vs GENERAL behaviour, labels and the restricted matched view are unchanged.

## Quantity
Quantities stay **whole numbers**. Inspection: the quotation engine (`computeQuote`/`priceBreakdown`) requires an integer quantity, the inquiry quantity validator accepts digits only and inventory uses milli-units only for stock. Allowing 12.5 m or 0.75 kg in a requirement would produce inquiries a supplier could not quote exactly. No migration is needed; a future change must start in the quotation money engine, then the inquiry validator, then the form.

## Authorization notes (empty supplier key)
A general requirement stores `supplierKey: ""`. Audited: every supplier read goes through `findInquiryFor` (direct only if the stored key is in the company's key list, otherwise the recipient relationship is required); `findCompanyBySupplierKey("")` matches nothing; the session context now drops empty strings from a company's stored `sellerKeys`, so even a corrupted `[""]` entry could not turn a general requirement into a DIRECT lead; admin link validation resolves the key against the catalogue, so an empty key cannot be linked. Restricted matched DTOs and private conversations are unchanged.

## Remaining
Definitions for other categories; a canonical type map between catalogue and supplier products; fractional quantities (see above); a scheduler for the worker (separate deployment dependency, not claimed to run); the integration suites (blocked).
