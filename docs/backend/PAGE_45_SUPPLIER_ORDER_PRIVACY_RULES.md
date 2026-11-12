# Page 45 — supplier visibility and privacy rules for orders

## Allocation (multi-supplier orders)
Inspected: `OrderDoc` has one `buyerId` and one `supplierKey`. The model has **no multi-supplier order and no supplier allocation / sub-order**, so there is nothing of another supplier's business inside an order that a supplier can read, and no supplier-visible total that must be carved out of a larger buyer total: the order total *is* the supplier's order amount (`totalMinor`, as stored, never recomputed from the catalogue). If a multi-supplier checkout is ever built it must write one document per supplier (or an explicit allocation) and this page's DTO already shows only the document the company owns; an order must never be duplicated "for visibility".

## Tenant scope
Every query carries `supplierKey ∈ company.sellerKeys`, where the company is resolved on the server from the verified session (`requireSupplierApi` / `requireSupplierPage`). `supplierKey`, `supplierId`, `supplierCompanyId`, `buyerId` and `companyId` parameters are never read. An unknown, malformed, lower-case or another supplier's reference gives the identical 404. A company with no seller sees nothing (never samples). The company's role must hold `viewOrders` (page: redirect to `/forbidden?portal=supplier`; API: 403) and, for the export, `exportOrders`.

## Role-specific DTOs over the shared record
| Surface | Fields exposed | Never exposed |
|---|---|---|
| List row | reference, placed / updated dates, buyer **business name**, first item name + item count, quantity text (first item, or "N items"), amount text + currency, stored status label and group, fulfilment label, payment "unavailable", quotation reference, detail link | buyer id, buyer e-mail / phone / address / name, supplier key / company id, the other items, events, internal ids |
| Detail | the above plus items as stored (name, quantity, unit, agreed unit price, catalogue link if any), history (status label, actor "Buyer" / "Your company" / "Finbyn Mart", time, the buyer's cancellation reason as plain text), the cancellation request, expected delivery (date and its source) | as above; no payment history, no address book, no binary documents, no unbounded arrays (items shown ≤ 100, history ≤ 100) |
| Export | reference, India-time dates, buyer business name, items (first 20 + count), currency, plain amount, status, fulfilment, "Payment status unavailable", quotation reference | contact data, address, ids, supplier key, other suppliers' rows |

Buyers are shown by business name only; a buyer without a record is "Individual buyer".

## Snapshots
Item names, quantities, unit prices, currency and total are the order's own stored snapshot. The catalogue is used only to link a product that still exists. A catalogue change or deletion cannot rewrite an order (test B-06 / D-01 read stored data only). The quotation and inquiry references are shown as links **only** when the quotation / inquiry is also this company's own (checked, not assumed), otherwise as plain text (D-04).

## Plain text only
Reasons and names are rendered as text (React escaping); no HTML, no markdown. CSV cells are always quoted and a leading `= + - @ tab CR` is defused.
