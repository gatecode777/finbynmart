# Page 45 — order status model and count semantics

The lifecycle is the ONE in `src/lib/orders/orderRules.ts` (13 stored statuses). Page 45 adds **no status**. `src/lib/supplier/orderRules.ts` decides only how a supplier groups, filters and reads it.

## Three different facts (never merged)
| Fact | Source | Shown as |
|---|---|---|
| Lifecycle ("Order status") | the stored `status` | the badge, in words with an icon |
| Fulfilment | `fulfilmentLabel(status)`: the delivery meaning of the stored status, nothing more (no carrier, no tracking, no "delayed") | a text column |
| Payment | **no source exists** (no ledger, provider or invoice) | always "Payment status unavailable"; never derived from acceptance, confirmation, dispatch or delivery |

Delivered does not mean paid; dispatched does not mean delivered; cancelled proves no refund; an accepted quotation is not an order. The fulfilment label is not a status filter of its own: one canonical filter exists (below).

## Status groups (they partition the 13 stored statuses)
| Group key | Chip / card label | Stored statuses |
|---|---|---|
| `awaiting` | Awaiting Confirmation (card) | PENDING_CONFIRMATION |
| `in_progress` | In Progress (card) | CONFIRMED, PROCESSING |
| `ready` | Ready to Dispatch (card) | READY_TO_DISPATCH |
| `shipped` | Dispatched | DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY (as stored) |
| `delivered` | Delivered | DELIVERED |
| `cancelled` | Cancelled | CANCELLED |
| `attention` | On Hold, Returns & Requests | ON_HOLD, CANCELLATION_REQUESTED, RETURN_REQUESTED, RETURNED |
| `all` | All / All Orders | every order, cancelled and returned included (history is never hidden) |

Every order is in exactly one group, so the chip counts add up to All (unit test G-01, C-02). Ready to Dispatch is **not** inside In Progress (the two cards are disjoint). A stored value the code does not know is counted nowhere and never shown as a made-up status.

## One canonical filter
`status` is ONE value: a group key above, or one exact stored status in lower case (`confirmed`, `cancellation_requested`, ...). `delivered` and `cancelled` are both a group and an exact status that select the same single status, so they are listed once (19 distinct values). Chips, cards and the Status select read and write that one value; choosing an exact status that is not a group highlights no chip and no card, so the page never claims a group that is not selected.

## Count scope
- The four cards and the eight chip counts are **orders** (one document = one order; there are no sub-orders), taken in **one database-side grouped read** of the stored status under the **base filters**: search text, date window (with its explicit basis) and currency. The **status filter is not applied to them**, so each chip shows what it would return.
- The list's `meta.total` is the exact count of the list itself (status applied).
- Search / date / currency narrow the counts; the page says so under the cards. Nothing is downloaded to be counted in JavaScript.
- Zero records give zeros. Counts are numbers of orders only: **no amount is summed**, certainly not across currencies (there is no revenue card).
- Partial fulfilment: no stored field represents it (an order has one status), so it is not represented and not invented.

## Dates
Date basis is explicit: **Order date** (`placedAt`) or **Last updated** (`updatedAt`). Windows are India calendar days, half open `[start, end)` (the shared `parseDashboardRange`); the page shows which basis applies once a range is chosen.

## Sorting
Newest, oldest (order date), recently updated; highest / lowest amount **only within one chosen currency** (a `currency` is required, otherwise 400, and the page picks the only currency automatically or asks for one). Every sort ends with `_id`, so paging is stable.
