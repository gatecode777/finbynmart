# Page 36 — Related-entity rules

A ticket may optionally point at one record. The server resolves and checks it; the client only sends `{ type, reference }`.

| Type | Accepted when | Label / link saved |
|---|---|---|
| inquiry | the inquiry belongs to the buyer | supplier name, `/buyer/inquiries/<ref>` |
| quotation | the buyer's own, **not DRAFT**, current version | supplier name, `/buyer/quotations/<ref>` |
| order | the order belongs to the buyer | supplier name, `/buyer/orders/<ref>` |
| product | the product exists in the catalogue (the picker offers the buyer's saved products) | product name, `/products/<slug>` |
| invoice, payment | **not supported** (the site has no such records) → 400 | — |

Refused with 400 and nothing stored: another buyer's inquiry/order/quotation, the buyer's own draft quotation, an unknown reference, an unknown product, invoice/payment types.
`GET /api/buyer/support/related?type=` returns at most 20 of the buyer's own records; a buyer is never offered another buyer's reference. Because the link is stored at creation, later deletion of the record does not break the ticket. The list can filter by related module (`relatedEntityType`) and search by the related reference.
