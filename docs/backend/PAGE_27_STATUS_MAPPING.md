# Page 27 — Status mapping and summary definitions

Stored lifecycle (unchanged, `src/lib/inquiries/rules.ts`): NEW, NOTIFIED, IN_PROGRESS, REPLIED, QUOTED, CLOSED, CANCELLED, REJECTED; old records say lowercase `new`. No status is renamed, duplicated or invented for the list. `src/lib/inquiries/buyerListRules.ts` is the one place that groups them (the dashboard imports the awaiting group from it).

| Stored status | Label shown | Tab(s) that include it | Buyer can cancel |
|---|---|---|---|
| NEW (and `new`) | New | New, Awaiting Response | yes |
| NOTIFIED | Awaiting Response (it is a notification step, so it is shown as the stage it means) | Awaiting Response | yes |
| IN_PROGRESS | In Progress | In Progress, Awaiting Response | yes |
| REPLIED | Replied | Replied | no |
| QUOTED | Quoted | Quoted | no |
| CLOSED | Closed | Closed | no |
| CANCELLED | Cancelled | Cancelled | no (already) |
| REJECTED | Rejected | Rejected | no |

"All" has no restriction. New and In Progress are subsets of Awaiting Response, so tab counts overlap and are never added together.

## Summary cards
- **Total Inquiries**: every inquiry of the buyer, cancelled and rejected included (history is never hidden; the same rule everywhere on the page).
- **Awaiting Response**: NEW + NOTIFIED + IN_PROGRESS: open, with no supplier reply recorded.
- **Replied / Quoted**: REPLIED + QUOTED as stored. An inquiry is never counted as quoted without that stored status. **No code sets either status today** (no supplier replies, no quotations), so the count is 0 and the card says so (`REPLIES_CONNECTED = false`).
- **Closed**: CLOSED only.
- The four numbers need not add up to the total (cancelled and rejected are in none of the last three).

## Consistency with the dashboard
The dashboard's "active inquiries" and the sidebar badge use the same constant as Awaiting Response (tested: the badge equals the card). The dashboard's own "Total Inquiries" is "created within the chosen period" (a date-ranged KPI with a comparison), so it differs from this page's all-time total by design; both read the same stored statuses.

## Where statuses change
Only two writers exist: submission (NEW) and the buyer's cancellation (CANCELLED). Everything else in the lifecycle is reserved for supplier/admin/notification processes that do not exist yet; the tests seed those statuses directly to prove the mapping.
