# Page 24 — Buyer Address Book (`/buyer/addresses`)

Owner PRD Page 24. Tracker ID 99 (new: the 78-page baseline has no buyer address page). Role: authenticated buyer only. Lives inside the shared buyer shell (`BuyerShell`); no second header, sidebar or footer.

## Layout
- Breadcrumb Home > Buyer Dashboard > Address Book; heading "Address Book"; one primary action, **Add New Address**.
- Four statistics: Total Addresses, Billing, Delivery, Business (unique records; an address with several purposes counts once in the total and once under each purpose) plus the default status for billing and delivery ("Set" / "Not set"). All come from the database for the signed-in buyer.
- Filter chips (All, Delivery, Billing, Business) with counts, `aria-pressed`; debounced search box (label, contact person, company, city, state, PIN; max 60 characters). Both live in the URL (`?type=`, `?q=`) and are restored on load; invalid values fall back to the full list.
- Address cards: label, purposes, text tags for Default Billing / Default Delivery (not colour only), contact person, company, phone, full address, landmark. Actions: Edit, Delete, Set as Default Billing, Set as Default Delivery (only where the purpose exists).
- Add/Edit dialog (accessible modal, focus moves in and stays inside, Escape asks before discarding unsaved changes, focus returns to the opener). Delete uses an alert dialog and explains that inquiries already sent keep their own location text.
- States: empty book ("You have no saved addresses yet." and why saving helps), no match (with Clear filters), loading, error with retry, per-field validation errors with focus moved to the first invalid field.

## Purposes and defaults
Eight purposes: Business, Billing, Delivery, Goods Receiving, Branch Office, Warehouse, Factory, Other. One default billing and one default delivery address per buyer, independent of each other (one address may hold both). A default requires the matching purpose. Rules: `docs/backend/PAGE_24_DEFAULT_ADDRESS_RULES.md`.

## Integration
- **Inquiry form (Page 13):** a signed-in buyer with delivery addresses gets a chooser (`AddressSelector`) that fills the existing "delivery location" field with "City, State PIN". The inquiry stores only that text. Guests see nothing.
- **Quotation, order, checkout:** none exist yet. `AddressSelector` and the `toAddressSnapshot` contract are ready for them (`PAGE_24_ORDER_ADDRESS_SNAPSHOT_RULES.md`). **BLOCKED** until those modules exist.
- Sidebar: "Address Book" is a real link and the current item.

## Not built (honest)
Address verification (no service; an address is never shown as verified), map/geo lookup, PIN-to-city autofill, import/export.

## Responsive
16 widths from 320 to 2560 were checked for overflow and control overlap; the filter chips scroll horizontally on narrow screens by design; dialog fits 320px.

Report: `docs/page-reports/24-buyer-address-book-report.md`.
