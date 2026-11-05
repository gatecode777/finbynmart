# Page 34 — Save and remove rules

**Save** (shared route `POST /api/buyer/wishlist/suppliers`, used by supplier cards, the profile's Save Supplier and the shared client store): session → rate limit → the supplier must resolve to a public catalogue record (`resolveSupplier`; unknown or inactive: 404) → 500 cap (409) → insert; the unique index makes a second save harmless (200, `alreadySaved`). The state shown on a heart is what the server stored.

**Remove one** (`DELETE /api/buyer/wishlist/suppliers/{id}`; this page confirms first in a dialog): deletes the buyer's own row only (`removed:false` for something never saved, including another buyer's).

**Remove Selected** (`POST …/bulk-remove`): 1 to 20 stored keys, validated and de-duplicated; one lookup of the buyer's own rows then one `deleteMany` scoped by the buyer's id; the answer lists what was removed and what was not saved. The page shows the real count in the toast.

**Clear All** (`DELETE /api/buyer/saved-suppliers {confirm:true}`): the dialog says only the buyer's own bookmarks go; the server requires `confirm:true`; one `deleteMany` on the buyer's id; the count is logged in `security_events`. A repeat removes 0.

**Never touched:** supplier records, products, other buyers' lists. Selecting (checkboxes, Select All) is client state only and changes nothing saved.

**Supplier status.** The data holds one status: a supplier is either still in the catalogue or not. A saved supplier that left is listed as unavailable with the name it was saved under, counted in Total Saved but not in Active, offers no Contact, Profile or Compare, and can be removed. A bookmark never keeps a permission after the supplier is gone: every action reads the live catalogue at the time. Suspended, unlisted and deleted-with-retention states do not exist in the data.

Tests: B-03, B-04, E-01 to E-07, G-01, G-02, H-11 to H-14.
