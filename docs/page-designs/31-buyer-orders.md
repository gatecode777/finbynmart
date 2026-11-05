# Page 31 — Buyer Orders

Routes (buyer only): `/buyer/orders` (list) and `/buyer/orders/[reference]` (compact order page; the full Page 32 PRD has not been sent). References `FBM-ORD-XXXXXXXX`. Design reference: the owner's generated Page 31 image (not stored in the repo). Design system: buyer shell with Orders current, teal/gold tokens, Anton headings, Montserrat body, shared Modal/ConfirmDialog/Toast, the My Inquiries list controls. No new colours, libraries or shell.

## Deliberate differences from the reference image

The image shows payment, invoice and tracking data and trend percentages. None of that exists in the product, so it is **not drawn**: no Payment Status or Invoice column, no Paid / Pending / Refund amounts, no trend arrows, no Track Shipment, no "Download Invoice". In their place: a Payment Overview box that says it is not available yet and shows no figure, and an honest delivery column. Columns kept: Order Reference & Date, Product(s), Supplier, Quantity, Order Amount (own currency, "as agreed"), Order Status, Delivery, Expected Delivery (with its source, or "Not Available"), Actions.

## List (`/buyer/orders`)

Heading "My Orders", breadcrumb Home / Buyer Dashboard / Orders, action Browse Products. Five cards (Total Orders, Processing, In Transit, Delivered, Returns / Issues) from the stored statuses with the documented rules; Payment Overview box (honest, no amount); tabs with counts (All Orders, Processing, In Transit, Delivered, Returns / Issues); search (order reference, quotation reference, product, supplier; debounced, literal); Filters dialog (exact order status, supplier, currency, order date with presets and a custom range, India time; a drawer on phones); sort (Newest, Oldest, Recently Updated, Highest / Lowest Order Amount, Expected Delivery Soon; the amount sorts are disabled until a currency is chosen); removable filter chips and Clear all; Export Orders (CSV); table from wide screens, one card per order below; pagination; URL state; stale-restore after Back. Row actions: View Order, and (only before dispatch) Request Cancellation.
Empty and error states: "No Orders Yet" (PRD wording) with Browse Products; no match with Clear filters; load error with Try again; the cards degrade separately ("key figures could not be loaded").

## Order page (`/buyer/orders/[reference]`)

Breadcrumb ends with the reference. Back, Print / Save, Request Cancellation (before dispatch). Overview (reference, supplier, quotation and inquiry links, placed and updated times, delivery, expected delivery with source, status), Items Ordered (snapshot with quantity and unit price) with the agreed amount, Order Activity (recorded events), a "Not Available Yet" panel (payments, invoices, tracking, returns, addresses). A cancellation request shows as a notice with its reason and that it is not cancelled yet. 404 for foreign, unknown or malformed references; an error boundary; no `loading.tsx` above a page that can 404.

## Behaviour that must not be faked

Status is never shown as paid, delivered, delayed, shipped or refunded without a stored value; an expected date that has passed changes nothing; a cancellation request is not a cancellation; success toasts appear only after the server answered.

## Responsive, accessibility, print

Table/card switch at the same breakpoint as My Inquiries; status is words plus icon; dialogs trap and return focus, Escape closes; tested at 16 widths for horizontal overflow and clipped headings. Print hides the shell and action buttons. Contrast was not measured with a tool.
