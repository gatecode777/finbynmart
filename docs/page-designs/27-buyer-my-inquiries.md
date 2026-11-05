# Page 27 — Buyer My Inquiries (`/buyer/inquiries`)

Owner PRD Page 27. Tracker row 26 (baseline "My Inquiries", `/account/inquiries`), route moved into the buyer workspace; `/account/inquiries` is now a permanent (308) redirect to `/buyer/inquiries` so old links, bookmarks and emails keep working. Role: authenticated buyer only. Reference image: the owner's "My Inquiries" screen (the first image sent with the PRD was a Saved Products screen by mistake).

## Layout (matches the reference)
- Shared buyer shell; **My Inquiries** is the current (gold) sidebar item with its real badge (open inquiries). Breadcrumb Home > Buyer Dashboard > My Inquiries; heading, description and the **Create New Inquiry** button, which opens `/products` (the existing discovery route: an inquiry is always sent to one supplier from a product or supplier page, there is no standalone form).
- Four summary cards (dashboard KPI cards): Total Inquiries, Awaiting Response, Replied / Quoted, Closed. Numbers come from the stored statuses of all of the buyer's inquiries; each says what it counts. Replied / Quoted states that supplier replies and quotations are not connected yet.
- Status tabs with counts: All, New, In Progress, Awaiting Response, Replied, Quoted, Closed, Cancelled, Rejected (Rejected is added to the PRD's list because it is a stored status and its records would otherwise have no tab). Counts follow the other active filters.
- Toolbar: search (debounced, 60 characters), **Filters** button with an active-filter count (type, supplier, product category, date range incl. custom), sort (Newest First, Oldest First, Recently Updated). Active filters appear as removable chips with Clear all filters.
- **BuyerInquiryTable**: Inquiry Reference (link) with type, Product / Requirement (thumbnail, name linked to the product page when it still exists, category), Supplier (initials badge, linked when it has a public page; never shown as verified), Quantity with unit ("Not Specified" when missing), Submitted On and Last Updated (India time, `<time>`), Status (icon and words), Actions: **View Details** and a menu with **Track Inquiry** (details page, `#progress`) and **Cancel Inquiry** (only when allowed). No View Quotation: no inquiry can have a quotation. The private message and delivery location are never in the list.
- Below 900px the table becomes one card per inquiry with the same data and touch-sized buttons; the filters open as a bottom sheet.
- Numbered pager with "Showing a - b of n inquiries" (20 per page, up to 50 by API).
- States: skeleton rows while a reload is slow, "No Inquiries Yet" (with Explore Products) for a buyer with none, "No matching inquiries" / "No inquiries match these filters" with Clear filters, an error with Try again for the list, and a separate "key figures could not be loaded" notice so a failing summary does not hide the table.

## Behaviour
Every change asks the buyer-scoped API again, ignores answers overtaken by a newer request, and keeps the choices in the address (`?status=&q=&inquiryType=&supplierId=&categoryId=&range=&dateFrom=&dateTo=&sort=&page=`), so reload, share and Back all restore them. A page restored from the browser's back/forward cache is read again. Cancelling uses the shared confirmation dialog (alert dialog, focus on "Keep inquiry"), then the success toast; the list and the cards are read again.

## Not built (honest)
Export (shown in the reference; not in the PRD and no export exists), bulk selection, supplier logos and verification marks (no such data), requirement titles (the inquiry has none), a linked-quotation action (no quotation module), real-time pushes (the page re-reads on focus and after changes).

Report: `docs/page-reports/27-buyer-my-inquiries-report.md`.
