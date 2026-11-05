# Page 31 — Order status lifecycle (single definition)

Code: `src/lib/orders/orderRules.ts` (`ORDER_STATUSES`, `STATUS_LABEL`, `GROUP_STATUSES`, `groupOf`, `statusesFor`, `tabCountsFrom`). No order statuses existed, so the PRD's candidate list is now the one definition. Dashboard, notifications, supplier and admin order management must import it, not redefine it.

Statuses (stored upper case): PENDING_CONFIRMATION, CONFIRMED, PROCESSING, READY_TO_DISPATCH, DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, ON_HOLD, CANCELLATION_REQUESTED, CANCELLED, RETURN_REQUESTED, RETURNED. An unknown stored value is never shown or counted.

| Group (card / tab) | Statuses | Rule |
|---|---|---|
| Total / All Orders | all 13 | Every order of the buyer, cancelled and returned included: history is never hidden. |
| Processing | CONFIRMED, PROCESSING, READY_TO_DISPATCH | PENDING_CONFIRMATION is not processing yet. Never inferred from missing shipment records. |
| In Transit | DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY | As stored. A tracking label alone proves nothing; no shipment module exists. |
| Delivered | DELIVERED | As stored. A passed expected date never makes an order delivered. |
| Returns / Issues | ON_HOLD, CANCELLATION_REQUESTED, RETURN_REQUESTED | Things needing attention now. Finished CANCELLED and RETURNED orders are history, not active issues. |
| (no card) | PENDING_CONFIRMATION, CANCELLED, RETURNED | Counted in Total and All Orders; reachable with the exact-status filter. |

Who may change a status: **no buyer action changes the main status directly.** The only buyer transition is a cancellation request (PENDING_CONFIRMATION, CONFIRMED, PROCESSING or READY_TO_DISPATCH → CANCELLATION_REQUESTED, with `previousStatus` and an event). Every other transition belongs to the future supplier / system side (BLOCKED).

Tab counts are counted under the other filters, so each tab shows what it would return. Tested: unit S-01 to S-06, integration C-02 to C-05, D-01, F-04.
