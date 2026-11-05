# Page 34 — Buyer Saved Suppliers

Route (buyer only): `/buyer/saved-suppliers`, with the comparison at `/buyer/compare-suppliers?ids=a,b`. This extends the page built earlier (`docs/page-designs/buyer-saved-suppliers.md`); it was modified, not rebuilt. Design reference: the owner's generated Page 34 image (not stored in the repo). Design system: buyer shell with Saved Suppliers current, teal/gold tokens, Anton headings, Montserrat body, shared Modal/ConfirmDialog/Toast, the My Inquiries list controls.

## Deliberate differences from the reference image

The image shows company logos, photo banners, star ratings with review counts, "Verified Supplier" on every card, a Countries card, and verification as a filter with more states. The data holds none of those, so: an initials badge replaces the logo; no banner and no rating or review is drawn; "Verified supplier" appears only where the supplier's record says so (otherwise "Not verified" in words); the fifth card is **States** (no country is stored or inferred); the verification filter offers Verified and Not verified only; there is no rating sort.

## Layout

Heading "Saved Suppliers", breadcrumb Home / Buyer Dashboard / Saved Suppliers, "Find More Suppliers". Top actions: **Compare Selected (n)**, **Add to Inquiry**, **Remove Selected (n)**, with a hint on the rules (compare 2 to 4, an inquiry goes to one supplier at a time, at most 20 selected, selecting never changes what is saved). Five summary cards: Total Saved, Verified, Active Suppliers, Product Categories, States. Toolbar: search ("Search in saved suppliers..."), Filters dialog (category, state, city, supplier type, verification; a drawer on phones), sort (Recently Saved, Oldest Saved, Company Name A-Z / Z-A, Most Products, Most Categories), Grid / List toggle (remembered), Clear all saved; removable filter chips; a selection bar (Select all on this page, count, Clear selection); cards; pagination.

Card: select checkbox, remove heart, initials badge, name (profile link), verification and type, location, description (only where the record has one), up to three category chips with "+N more", product and category counts, member-since, saved date, **Contact Supplier** (the inquiry form) and **View Profile**. An unavailable supplier keeps its saved name, says it is no longer available and can only be removed. List view: one wide row per supplier on large screens, stacked below 576 px.

States: "No Saved Suppliers Yet" (PRD wording, Explore Suppliers), no match with Clear filters, load error with Try again, key figures failing separately from the list. Removals (one, selected, all) ask first, say that only the bookmark goes, and report the real count after the server answered.

Accessibility: verification as words, labelled checkboxes, dialogs trap and return focus, Escape closes. Tested at 16 widths in both views. Contrast was not measured with a tool. Print is not relevant to this page.
