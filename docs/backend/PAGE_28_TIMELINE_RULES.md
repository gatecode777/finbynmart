# Page 28 — Timeline rules

The timeline is the Page 14 `buildTimeline` (`src/lib/inquiries/timeline.ts`) fed by the inquiry's persisted `statusHistory`, shown by the shared `InquiryTimeline` component, plus a plain history list of the same entries. A step is **done only when its event is recorded**; nothing is inferred from a later status, and no future step is shown as done.

| Step | Done when | Otherwise |
|---|---|---|
| Inquiry Submitted | always (the record exists), with `createdAt` | n/a |
| Supplier Review | the history holds IN_PROGRESS, REPLIED or QUOTED | current ("Waiting for the supplier to review"), or "Not applicable" after a final status |
| Supplier Response / Quotation | the history holds REPLIED (titled Supplier Response) or QUOTED (Quotation Received) | upcoming / current / not applicable; says response timing depends on the supplier |
| Inquiry Cancelled / Closed / Rejected | a final status with its event time | not shown |

- **Supplier notification** is **not** a completed step: `notification.status` is always BLOCKED (no service), so the page shows the line "Supplier notification is not set up yet, so the supplier is not told automatically" under the timeline. If a notification service is added, the line changes with its recorded state; "sent" would still not mean the supplier read it.
- **Buyer decision** has no step: there is no selection or order.
- No response times are invented; the text says timing depends on the supplier.
- Today only submission and cancellation are ever recorded, so the realistic timeline is Submitted, Supplier Review (current) and, after a cancel, Cancelled. The tests seed the other statuses directly to prove the rendering (IN_PROGRESS shows Supplier Review as completed with its time and does not show a quotation or closing step).
- An old record without `statusHistory` shows its submission time only, and the history card says so.
- Accessibility: each state is also written for screen readers ("Completed", "Current step", "Not reached yet", "Not applicable"); the list is an ordered list with `aria-current="step"` on the current step; times are `<time>` elements in India time.
