# Page 24 — Address API reference

All routes: buyer session required (401 without, 403 for a supplier, suspended accounts lose the session), private `no-store` responses, shape `{ ok, message, fields?, code?, data? }`. Writes share one limit: **60 per 10 minutes per buyer** (429 after). The buyer is always taken from the session.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/buyer/addresses` | List + statistics. Query: `type` (all, delivery, billing, business), `q` (≤60 chars, literal text, case-insensitive over label, contact person, company, city, state, PIN), `page` (≥1), `limit` (1–50, default 50). Unknown values → 400. `data: { addresses, statistics, meta{total,page,limit,totalPages} }` |
| POST | `/api/buyer/addresses` | Create (201 → `data.address`). Optional `isDefaultBilling`, `isDefaultDelivery`, `forCompany` |
| GET | `/api/buyer/addresses/[id]` | One address; 404 for unknown, malformed or another buyer's id (identical answer) |
| PATCH | `/api/buyer/addresses/[id]` | Full update; body must include `version`. 409 `CONFLICT` if stale. `data: { address, clearedDefaults }` |
| DELETE | `/api/buyer/addresses/[id]` | Hard delete. `data.clearedDefaults` names defaults that are now empty; nothing is auto-promoted |
| PATCH | `/api/buyer/addresses/[id]/default` | Body `{ type: "BILLING" | "DELIVERY" }`. Returns the confirmed updated list |

## Errors
400 validation (`fields` per field; server-only fields such as `buyerId`, `companyId`, `createdAt`, `id`, role are refused; operator objects refused) · 401 · 403 · 404 · 409 with `code`: `CONFLICT` (stale version), `LIMIT` (50 addresses), `NO_COMPANY` (`forCompany` without a company), `PURPOSE_MISSING` (default for a purpose the address lacks) · 429.

## DTO
`id, label, purposes, contactPerson, companyName, phone{countryCode,number,normalized}, addressLine1, addressLine2, landmark, country, state, city, postalCode, isDefaultBilling, isDefaultDelivery, forCompany, version, createdAt, updatedAt`.

## Client use
`AddressSelector` (`src/components/buyer/AddressSelector.tsx`) calls the list route with `type=delivery` and hands the chosen address to its caller; it never sends an id anywhere.
