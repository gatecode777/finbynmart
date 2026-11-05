# Page 37 — Related entity access

`getBuyerRelatedDetails` (`relatedDetails.ts`). The ticket stores `{type, reference, label, href}` from Page 36 for the list; **the ticket page never trusts it**. On every view the record is read again with the buyer's id in the query.

| Type | Read | Shown |
|---|---|---|
| inquiry | `inquiries` by reference AND buyer | product (or "General inquiry"), supplier, status, submitted date, link `/buyer/inquiries/<ref>` |
| quotation | `quotations` by reference AND buyer, current, **not DRAFT** | product, supplier, status, received date, link |
| order | `orders` by reference AND buyer | "Order <ref>", supplier, status, placed date, item count, link |
| product | public catalogue by key | name, product id, category, public link |
| invoice, payment | **do not exist** in this application | cannot be linked (Page 36 refuses them) |

If the record is gone, is no longer the buyer's, or a quotation went back to draft, the answer is `{available:false, message:"This record is not available to you any more."}` with **no** title, supplier or status (tested by changing the owner). A ticket with no related record answers `{related:null}` and the page says so. The stored link is not used; the link is rebuilt from the type and the reference, and the destination page checks ownership again. No client URL is ever followed. A failure of this read leaves the ticket and the other tabs working (the tab says it could not load). Status words are the stored status made readable; no price, address or contact detail of any record is shown.
