# Page 36 — Support status lifecycle

Single source: `TICKET_STATUSES`, `STATUS_LABEL`, `GROUP_STATUSES`, `groupOf`, `STATUS_TRANSITIONS`, `canTransition` in `src/lib/support/ticketRules.ts`.

| Status | Label | Card group |
|---|---|---|
| OPEN | Open | Open |
| ASSIGNED | Assigned | Open |
| REOPENED | Reopened | Open |
| WAITING_FOR_BUYER | Waiting for You | Open |
| IN_PROGRESS | In Progress | In Progress |
| WAITING_FOR_SUPPORT | Waiting for Support | In Progress |
| RESOLVED | Resolved | Resolved |
| CLOSED | Closed | Resolved |

The summary cards, the list badges and the status filter all use this one mapping.

## Who changes status
- Creation: always `OPEN`, by the server.
- Buyers: **cannot** change status. No buyer route accepts one; PUT/PATCH/DELETE on a ticket answer 405; a status sent at creation is refused 400. Reopen and close buttons are not shown because they would not work.
- Support side: does not exist yet (BLOCKED). `STATUS_TRANSITIONS` documents the intended rules (e.g. RESOLVED → CLOSED or REOPENED; CLOSED → REOPENED only) for when it does; nothing in the application performs a transition today.
- If a status is changed directly in the database, the buyer's list, cards and detail show it, and the history lists it with its actor and time (verified in the test suite, E-01).

## History
`events[]` is append-only. The buyer sees "Ticket raised" and "Status: X" entries with actor (You, Support, Finbyn Mart) and time.
