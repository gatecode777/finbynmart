# Page 31 — Delivery status and expected delivery

Status: **shipment tracking BLOCKED.** No shipment, courier or tracking-event module exists.

Delivery column: `deliveryLabel(status)` restates the **order status** in delivery terms (Not Dispatched, Ready to Dispatch, Dispatched, In Transit, Out for Delivery, Delivered, On Hold, Cancelled, Returned) and nothing more. No carrier event, tracking number, live tracking or "Delayed" label is ever produced: delay needs a valid expected date and a documented rule, and no such rule has been defined. A passed expected date never changes a status (test C-05).

Expected delivery: shown only when the order holds `expectedDelivery {date, source}`; the source is shown (Carrier estimate, Supplier commitment, Order schedule, in the PRD's priority order for whoever writes it). Otherwise the cell says "Not Available". The frontend never calculates an estimate. "Expected Delivery Soon" sorts by the stored date (undated orders last) using an index.

Track Shipment is not offered anywhere. For a future courier integration: validate the provider response, store events under their shipment, prevent duplicate events, and only then add a tracking action.
