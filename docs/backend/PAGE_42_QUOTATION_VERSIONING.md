# Page 42 — versioning

The schema already versions quotations: every version is its own document with the same `reference`, a rising `version`, and exactly one `isCurrent: true`; an earlier version becomes `SUPERSEDED`. A sent version is never edited. **Page 42 adds no versioning code and fakes no history**: nothing in the application writes a second version yet (the quotation creator, Page 43, will).

What this page does with versions:
- Lists and counts only the current version of each lineage (`isCurrent: true`), so a revision is never a second quotation (`B-01`, `B-06`).
- Detail opens the current version, or `?version=n` for an earlier one (labelled "an earlier version: not the current offer"; no withdraw offered).
- The Versions panel and `GET …/versions` show each saved version (max 20) with its status, submit date, unit price, total, validity and "changed from the previous version" (unit price, quantity, discount, tax, charges, validity, delivery, payment, packaging or warranty) using the same `changesBetween` as the buyer page.
- Buyer decisions are stored on the version they were made on (`decision`, `accepted`); an accepted version is immutable here (no edit route; withdrawal refused).
- Withdrawing changes the current version's status and adds an event; it creates no version.

Blocked until Page 43: creating a revision, "revised by", change summaries typed by the supplier.
