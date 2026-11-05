# Page 36 — Support category rules

Single source: `SUPPORT_CATEGORIES` in `src/lib/support/ticketRules.ts`. The form, the filters, the list labels and the server validation all read it; `GET /api/buyer/support/categories` publishes it.

| Slug | Label |
|---|---|
| account-login | Account & Login |
| product-catalogue | Product & Catalogue |
| supplier-communication | Supplier Communication |
| inquiry-rfq | Inquiry & RFQ |
| quotations | Quotations |
| orders-delivery | Orders & Delivery |
| payment-billing | Payment & Billing |
| invoice-documents | Invoice & Documents |
| technical-issue | Technical Issue |
| profile-verification | Profile & Verification |
| other | Other |

Rules
- A category is required and must be one of these slugs; anything else is 400. The client sends the slug; the label is derived on the server.
- Payment & Billing and Invoice & Documents exist as categories to receive reports; the site has no payments or invoices, so a ticket in them cannot link to an invoice or payment record (see RELATED_ENTITY_RULES).
- Adding a category is one edit in `SUPPORT_CATEGORIES`; existing tickets keep their slug (unknown slugs read back as "Other").
- Categories do not imply routing, priority or response time. None exists.
