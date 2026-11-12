# Page 42 — withdrawal rules

Policy (`canWithdraw`, pure, unit-tested): only the **current** version of a quotation that is still **waiting on the buyer** (`SENT` or `REVISION_REQUESTED`) and whose **validity has not ended**.

| Quotation is | Result |
|---|---|
| Submitted, Revision Requested (valid) | withdrawn |
| Accepted | 409 "closed commercial decision" (no order policy exists, so accepted stays final) |
| Rejected / Withdrawn / Expired / Draft | 409 with the reason in words |
| An earlier version | not offered |
| Another supplier's / unknown / malformed | 404 (identical) |

Flow (`POST …/withdraw { confirm: true, reason? }`): cross-site check → session → rate limit (20 / 10 min) → body whitelist (`confirm`, `reason` ≤ 500; anything else, e.g. `status`, is a 400) → resolve company → find by `reference` AND `supplierKey ∈ sellerKeys` AND `isCurrent` → policy → **one atomic conditional update** (status read earlier must still be the stored one, validity still ahead) → event `{WITHDRAWN, supplier, reason}` → buyer in-app notice via `notifyBuyer` (category "inquiries", `dedupeKey` per reference and version so a retry cannot add a second) → answer with the real new state.

- Nothing is deleted; history, versions and events are kept. A withdrawal is never a rejection.
- The answer says whether a notice was **really recorded** (`buyerNotified`); a buyer who switched inquiry notices off gets none and the message says so. No email is sent or claimed (no email service).
- A buyer who accepted a moment earlier wins (test `F-08`); a withdrawn quotation can no longer be accepted by the buyer (`F-15`).
- UI: a modal naming the quotation and its status, the effect, an optional reason, and explicit "Withdraw quotation" / "Keep quotation" (native `<dialog>`: focus trap, Escape, focus return).
