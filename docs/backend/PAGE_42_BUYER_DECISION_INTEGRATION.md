# Page 42 — buyer decision integration

Acceptance, rejection and revision requests are written **only** by the Buyer Portal routes (`/api/buyer/quotations/[reference]/accept | reject | revision-request`, `decideQuotation`, `requestRevision`). The supplier side has no route that sets `ACCEPTED`, `REJECTED` or `REVISION_REQUESTED`; a supplier body containing a status is refused (400) and a PATCH answers 405 (test `E-14`, `F-02`, unit `W-06`).

Synchronisation is by construction: both sides read the same documents.
- Buyer accepts → `status: ACCEPTED`, `accepted: true`, `decision`, event `ACCEPTED` → the supplier list shows **Accepted**, the Accepted card/tab count it, the detail shows "Accepted by the buyer" with the time and any reason.
- Buyer rejects → Rejected likewise. A withdrawal is never shown as a rejection.
- Buyer requests a revision → **Revision Requested**, with the buyer's reason and message on the supplier detail ("Sending a revised version is not available yet").
- Supplier withdraws → the buyer sees Withdrawn and cannot accept (test `F-14`, `F-15`).
- Nothing is inferred from elapsed time, a follow-up or a message. "Viewed" is not shown: no buyer-view tracking exists.

Supplier-side notification of a buyer decision is **BLOCKED**: there is no supplier notification store (the dashboard reports `notificationsAvailable: false`); the buyer-side routes do not notify a supplier. The supplier sees the decision when they open the page (the list refreshes on window focus).
