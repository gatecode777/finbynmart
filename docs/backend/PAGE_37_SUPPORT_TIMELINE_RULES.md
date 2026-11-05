# Page 37 — Timeline rules

`getBuyerTimeline`. Two real sources, merged by one ordering key (time, then events before messages at the same millisecond, then id): the lifecycle events embedded on the ticket and the buyer-visible `kind: "reply"` messages. There is no separate timeline collection and nothing is inferred.

| Entry | Source |
|---|---|
| Ticket created | event CREATED |
| Status changed / Ticket resolved / Ticket closed ("From X to Y.") | event STATUS_CHANGED (by support, or by the buyer when a reply moved a waiting ticket to In Progress) |
| Ticket reopened ("Reopened from Resolved.") | event REOPENED |
| Feedback sent (no rating or text in the timeline) | event FEEDBACK_SUBMITTED |
| You replied / Support replied (with a file count) | messages |

- Events flagged `internal` and internal messages never appear. A reopening reason is part of the REOPENED entry and is not listed twice.
- Each entry has the recorded time and an actor label (You, Support, Finbyn Mart); nothing shows an agent's identity.
- Oldest first, 20 per page by default (50 at most) with an `after` cursor; the merge fetches one page of messages and filters the events after the cursor, so paging gives exactly the same entries as one big page (tested: 3 at a time).
- A retried send creates no second message and therefore no second entry. Reopen and feedback are guarded by unique keys / a unique index, so a retry cannot add a second event.
- The embedded events array is small (creation, status changes, at most 3 reopenings, one feedback); if a future support side wrote very many status changes the events would need their own collection (noted, not needed today).
