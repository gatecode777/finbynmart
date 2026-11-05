# Page 24 — Address data model (`buyer_addresses`)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Used as the address id in URLs; never trusted without the buyer match |
| `buyerId` | ObjectId | From the session only; a `buyerId` in a request is refused |
| `companyId` | ObjectId? | Set by the server to the buyer's own company when `forCompany: true`; never accepted from the client |
| `label` | string | 2–60, no `<` `>` |
| `purposes` | string[] | At least one of BUSINESS, BILLING, DELIVERY, GOODS_RECEIVING, BRANCH_OFFICE, WAREHOUSE, FACTORY, OTHER |
| `contactPerson` | string? | Letters only, max 100; required with Delivery or Goods Receiving |
| `companyName` | string? | 2–150 |
| `phone` | `{countryCode, number, normalized}`? | Validated per country code; required with Delivery or Goods Receiving |
| `addressLine1` / `addressLine2` / `landmark` | string / string? / string? | 3–150 / ≤150 / ≤100 |
| `country`, `state`, `city`, `postalCode` | string | Supported country list; India PIN six digits, not starting 0; other countries their own rule |
| `isDefaultBilling`, `isDefaultDelivery` | boolean | At most one true each per buyer (database-enforced) |
| `version` | int | Starts at 1; updates must send it (optimistic concurrency) |
| `createdAt`, `updatedAt` | Date | Server time |

No field says anything about verification. The API returns an allow-listed DTO (no `buyerId`, no `_id`, no `companyId`; `forCompany` boolean instead).

## Indexes
| Index | Purpose |
|---|---|
| `{buyerId:1, createdAt:-1}` | Every list/search (buyer scoped, newest first, no sort stage) |
| `one_default_billing_per_buyer`: unique `{buyerId:1, isDefaultBilling:1}`, partial where `isDefaultBilling: true` | At most one default billing address per buyer |
| `one_default_delivery_per_buyer`: unique `{buyerId:1, isDefaultDelivery:1}`, partial where `isDefaultDelivery: true` | Same for delivery |

`_id` lookups always add `buyerId`. Explain results: `docs/page-reports/tools/24-address-explain.mjs` (list, filtered list, text search: LIMIT > FETCH > IXSCAN, 50 keys and 50 documents examined for a buyer among 10,000 rows; statistics: GROUP > COUNT_SCAN).

## Audit trail
`security_events` (existing): ADDRESS_CREATED, ADDRESS_UPDATED, ADDRESS_DELETED, ADDRESS_DEFAULT_BILLING, ADDRESS_DEFAULT_DELIVERY, with **field names only** (never an address, name or phone).
