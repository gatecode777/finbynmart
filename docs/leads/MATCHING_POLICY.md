# Matching policy `match-1` and the recipient field matrix

## Principle
Automatic distribution is mandatory for a registered buyer's **catalogue product inquiry**: there is no checkbox, toggle or preference that turns it off. Distribution never authorises disclosure of the buyer's private data. Matching is exact and evidence-based; when equivalence cannot be proved, nothing is sent (no quota is filled).

## What the catalogue really offers (audit result)
- 21,392 listings, each owned by ONE seed seller. There is **no shared canonical product id** across sellers.
- Structured evidence per listing: category (name + department + product type), product name, colour. Sizes, price and MOQ exist but the buyer's request states none of them, so they are **not** used.
- Approved supplier products (MongoDB `supplier_products`) are NOT a source yet: no public surface reads them and the quotation engine cannot resolve their product keys, so a lead for them could not be quoted. Sample listings (`source: "sample"`) are demo data and are excluded.

## Rule
Two listings are the same product only when ALL hold:
1. same category (name + department + product type),
2. same normalised product name (case, spacing, punctuation ignored; nothing else: no substring, no similarity),
3. same colour **when the requested listing states one** (a colour is never invented).

A candidate with missing category or name is never a match. Quantity and unit are never compared or converted; stock and MOQ never exclude a supplier (a lead is not a promise of stock); nothing is reserved or ordered.
Measured on the real data (unit test `62`): 444 of the first 4,000 listings have at least one other seller offering the exact same product.

## Supplier eligibility
A matched recipient is an **active** `supplier_companies` row whose `sellerKeys` contains the matching seller (seller ownership is only ever set by the admin `linkSeller` action; seed sellers without a company are counted as `unmapped` and are never reported as delivered). One company with several matching sellers gets **one** lead (deterministic seller). The company that owns the selected supplier is excluded. No verification badge, subscription or paywall rule is required or invented. Eligibility (inquiry open, company active, still owns the seller) is re-checked inside the transaction that creates each recipient.

## Cutoff
The candidate companies are **frozen once** when the job first runs (normally seconds after submission). Companies linked later are not added; a company that became inactive is skipped. Gap: the data model keeps no history of when a seller was linked, so "eligible at the inquiry's submission instant" cannot be reconstructed; the freeze time is the cutoff. Operational cap: `MAX_RECIPIENTS_PER_INQUIRY = 2000` companies per inquiry (a product decision to confirm); beyond it the job records `truncated` and the buyer is told.

## Field matrix (service-boundary redaction, `src/lib/leads/access.ts`)
| Data | DIRECT supplier | MATCHED supplier | Buyer |
|---|---|---|---|
| Inquiry reference, status | yes (shared status) | yes (the recipient's OWN status; a buyer cancel/close shows) | yes |
| Product name, category, quantity, unit | yes | yes | yes |
| Product specifications | selected listing's | the recipient's own equivalent listing's | yes |
| Product page link | yes | **no** (it would reveal the selected supplier) | yes |
| Delivery location text | yes | yes | yes |
| Buyer message | yes | yes (the buyer is told, next to the field and the submit button, who sees it) | yes |
| Buyer business name | yes | yes | yes |
| Buyer e-mail, phone, address, account id | never | never | n/a |
| Guest fields, idempotency key | no | no | n/a |
| Selected supplier identity | yes | **no** | yes |
| Other recipients, their count, replies, quotations | no | **no** | offers are listed separately with their origin ("the supplier you selected" / "matched supplier") |
| Shared status history | yes | **no** (empty) | yes |
| Attachments | none exist for inquiries (not built); a future attachment is direct-only by default |

Reliable automatic redaction of contact details typed into free text is **not** implemented and is not claimed: the buyer is told not to put contact details in the message. Contact disclosure to a matched supplier needs a separate, explicit workflow (not built).

## Recipient identity and isolation
A MATCHED recipient carries its **own** seller key (`inquiry_recipients.recipientSupplierKey`). The supplier-side view substitutes it for `supplierKey`, so that company's messages, quotations and orders carry its own identity and every existing `supplierKey ∈ company.sellerKeys` filter keeps isolating recipients from each other. Every supplier-side read of an inquiry goes through `findInquiryFor` (source regression test `62`).
