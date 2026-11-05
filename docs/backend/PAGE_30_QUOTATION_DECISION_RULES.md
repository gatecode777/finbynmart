# Page 30 — Accept / reject rules

| Rule | Behaviour |
|---|---|
| Who | The owning buyer only (session; ownership re-checked through the parent inquiry). Foreign or unknown reference: 404, nothing changed. |
| Which version | The request names the version. If it is not the current one: 409 `STALE`. |
| Confirmation | `confirm: true` is required; the UI asks in a dialog naming reference, version, supplier, quantity, price, total and validity. |
| Accept allowed when | current version, status SENT, not expired, and no other quotation of the inquiry is already accepted. |
| Reject allowed when | current version, status SENT or REVISION_REQUESTED, not expired. |
| Not allowed (409) | expired, already accepted/rejected, withdrawn, superseded, revision-requested (accept only). Each has its own message. |
| Atomic | One conditional `findOneAndUpdate` on id + buyer + isCurrent + exact version + open status + `validUntil > now`; a second simultaneous request finds nothing to update. |
| One accepted per inquiry | Accepting sets `accepted: true`; the unique partial index `one_accepted_per_inquiry` makes two accepted quotations of one inquiry impossible even for simultaneous requests (409 `ALREADY_ACCEPTED`). |
| Saved | status, `decision {type, at, reason}`, `events` entry (actor buyer). Reject reason optional, ≤ limit, no `<` or `>`. |
| What accepting does NOT do | No order, payment, invoice or reservation is created (an `orders` collection now exists for Page 31, but nothing converts an accepted quotation into an order: that needs a future checkout or supplier flow); the supplier is **not notified**; other quotations are not changed. The response and dialog say so (`supplierNotified: false`, "order processing is not available yet"). |
| Status of the inquiry | Not changed by a decision (no supplier workflow to confirm it). |

Tests: F-01 to F-21 in `29-30-buyer-quotations-test.mjs` (including 2 racing accepts → one 200 and one 409; five identical accepts → one winner; accept and reject at once → consistent state).
