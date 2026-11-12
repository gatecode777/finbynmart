# Page 40 — Supplier Inquiries & Leads: audit (2026-11-11)

Verified against the repository before any building, as the PRD requires. **Result: the foundations Page 40 stands on do not exist, so nothing was built. The page is BLOCKED pending an owner decision (end of this file).**

## What exists
| Area | Finding |
|---|---|
| Buyer inquiry creation | Real (Pages 13–14, 27–28): `inquiries` collection, server-generated `FBM-INQ-XXXXXXXX` reference, buyer from the session or a guest contact, product/requirement, quantity and unit, message, delivery location, idempotency key, status lifecycle (buyer-side), `statusHistory`, buyer cancellation. No required-by date, budget, attachments or priority fields |
| How an inquiry reaches a supplier | **Addressed by the buyer to ONE seller**: `supplierKey`, `supplierName`, `supplierSlug`, `source: "catalog" \| "sample"`. There is no distribution engine, no category or location matching, no assignment collection, no lead credits. An inquiry is not delivered to "all suppliers" and not to any registered supplier account |
| Sellers | The catalogue sellers (1,200 fictional research-dataset sellers) and the sample listings. They are **not** registered accounts and carry no owner |
| Supplier accounts | `users` with `role: "supplier"`: business details stored inline (`supplier.businessName`, phone, city, offering). **No link to any seller or `supplierKey`**, no company record, no company membership, no staff roles (owner/admin/sales/read-only) |
| Supplier response | none: no model, no endpoint, no clarification messages, no supplier events. The buyer-side page already says supplier replies "are not connected yet" |
| Quotations | the buyer reads them (Pages 29–30), but **no code creates one**: no supplier quotation service, form or revision workflow exists (tests insert quotation rows directly) |
| Notifications | buyer in-app notifications only; there is no supplier recipient, no new-inquiry notification, no email |
| Export | no supplier export service |
| Orders / conversion | `orders` exists (buyer reads; nothing creates them from a quotation), so a conversion rate has no real events behind it |
| Supplier portal shell | **none**: no `/supplier/*` route, no supplier sidebar/topbar. **The PRD's "Page 39" (supplier dashboard, its design spec and `PAGE_39_SUPPLIER_DASHBOARD_AUDIT.md`) was never built or written in this repository**; the tracker row 35 is Not Started. After sign-in a supplier lands on the public home page (flag `SUPPLIER_PORTAL_AVAILABLE = false`) |
| Supplier APIs | none under `/api/supplier` |

## Consequences for each requirement
- **Listing, KPIs, tabs, search, filters, preview, export:** would read from `inquiries` by `supplierKey`, but no supplier account can be tied to a `supplierKey`, so the real list for every supplier is empty. Showing anything else would be invented leads, which the PRD forbids.
- **Respond, clarification, create quotation, buyer notifications, conversion rate:** each needs a supplier-side write workflow (response and message model, quotation creation, order creation) that does not exist. Building them would mean creating those modules, not integrating them.
- **Tenant isolation:** impossible to enforce without a supplier company/membership model to resolve.
- **Supplier shell:** must come from Page 39; Page 40 must reuse it, not create a second one.
- **Priority, required date, attachments:** buyer inquiries do not capture them, so those fields/filters must be omitted (PRD: only when genuinely present).

## Decision needed (what would unblock it)
Page 40 needs, in order: (1) the supplier portal shell (Page 39), (2) a **supplier company + membership model** and a rule that ties a company to the sellers it owns (`supplierKey`), including how an existing registered supplier "claims" a catalogue/sample seller (today the buyer-side rule is that companies cannot be claimed), (3) supplier-side response/message and quotation-creation workflows. See the questions put to the owner in the implementation report.
