# Page 30 — Version history

- **Model:** one quotation lineage shares one `reference` (`FBM-QT-XXXXXXXX`); every version is its own document (`version` 1, 2, …) with `isCurrent` true on the latest. Versions are never edited. A newer version makes the older one `SUPERSEDED` (written by the future supplier side; this module only reads).
- **Read:** the detail answer returns up to 20 versions (newest first) with status, sent date, unit price, total, validity and a list of what changed against the previous version (unit price, quantity, discount, tax, charges, validity, delivery timeline, payment terms, packaging or warranty).
- **Open an earlier version:** `?version=N` on the page or API. It shows that version's own numbers, is marked not current and offers no decision. A non-existent or invalid version is a 404.
- **Decisions are version-specific:** accept, reject and revision requests carry the version number; if a newer version has appeared the server answers 409 `STALE` and changes nothing.
- **Status derivation:** EXPIRED, ACTIVE and EXPIRING_SOON (≤ 7 days) are derived from `validUntil` when read; the stored status is not rewritten by reading. No scheduled job exists or is claimed.
- **BLOCKED:** creating a new version (supplier revision in answer to a buyer's request). Until a supplier module exists, a requested revision stays "Revision Requested".
