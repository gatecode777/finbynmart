# Page 42 — order conversion: BLOCKED

**Status: BLOCKED.** The order system (`src/lib/orders/service.ts`) lets a buyer read orders and request a cancellation; **no code creates an order, and none creates one from an accepted quotation**. The buyer's own page says "Order processing is not available yet". Building the conversion here would mean inventing an order workflow (pricing carry-over, payment, fulfilment), which the PRD forbids simulating.

What exists and is honest:
- An accepted quotation is shown as Accepted. The detail's Order field says "No order is linked to this quotation yet".
- If an order row genuinely carries `quotationReference` and the company's `supplierKey`, its reference and status are shown read-only (test `E-10`, using a row inserted in the throwaway DB). Nothing on this page creates, links or changes an order.
- `capabilities.convertToOrder: false` with its reason.

Rules for the future conversion (so it is safe when built): only from an `ACCEPTED` current version; verify buyer, supplier company and the accepted snapshot; carry the stored amounts, never the catalogue; one order per accepted quotation (unique index on `quotationReference`) so repeated acceptance cannot create two; record the conversion event and notify both parties; never create an order from a submitted quotation.
