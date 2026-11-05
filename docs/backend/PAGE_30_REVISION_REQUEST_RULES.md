# Page 30 — Revision request rules

- Endpoint: `POST /api/buyer/quotations/{reference}/revision-request` `{version, reason, message}`.
- `reason` must be one of PRICE, QUANTITY, DELIVERY, PAYMENT, SPECIFICATIONS, OTHER; `message` 10–1000 characters, no `<` or `>`; unknown fields are refused; the version must be current.
- Allowed only for a current, open (SENT), unexpired quotation. Duplicates are prevented by the update itself: it only matches status SENT, so a second submission finds nothing (409) and no second event is stored.
- Saved: status → `REVISION_REQUESTED`, an `events` entry with reason and message (actor buyer). The quotation's amounts and terms are never edited.
- The buyer may still reject a quotation whose revision was requested; accept is not offered until the supplier answers.
- **BLOCKED:** delivering the request to the supplier and receiving a new version. There is no notification channel and no supplier workflow, so the API answers `supplierNotified: false` and the dialog says "The supplier is not notified automatically yet". No success message claims delivery.
- Tests: F-12 to F-15, G-22, G-23.
