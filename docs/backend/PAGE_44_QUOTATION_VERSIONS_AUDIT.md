# Page 44 — Supplier Quotation Details & Version History: audit (2026-11-12)

**Route and tracker.** The PRD proposes `/supplier/quotations/[quotationReference]`. That route **already exists** (it was built as the Page 42 detail page, and is the route the quotation list, the create flow and the success notice already link to), so this page **extends it** instead of adding a second page. The tracker's row 45 owns `/supplier/quotations`; the detail route had no row of its own, so this PRD gets a new tracker ID that points at the existing route.

| PRD assumption | Repository fact | Decision |
|---|---|---|
| A version model | **Exists**: one document per version, same `reference`, `version`, one `isCurrent`, older ones `SUPERSEDED`; unique `(reference, version)` | Reused. A revision is a new version document |
| Current submitted offer pointer, accepted-version pointer | `isCurrent` (current) and `status: ACCEPTED` / `accepted:true` | Pointers are computed from those (`pointers.currentVersion / acceptedVersion / revisionDraft`) |
| Draft revision vs current offer | A draft was only ever the first version (`isCurrent: true`, hidden from the buyer by `status != DRAFT`) | A **revision draft is `isCurrent: false`** until submitted, so the buyer keeps seeing the real current offer; at submission the previous current becomes `SUPERSEDED` in the same transaction. The "highest version number" is therefore never presented as current |
| Revision creation | None | `POST …/revisions` (idempotent, transactional); edit and submit reuse the Page 43 routes unchanged apart from lookup by highest draft/current version |
| Line items with stable ids | The model holds **one** line per quotation (Page 43 decision); the snapshot input carries `lines[0].id` (`line-1`), legacy records have none | Compare matches by that stable id (legacy single line = `line-1`); lines are never matched by name or position (tested) |
| Commercial snapshot | Page 43 writes `snapshot` (policy version, tax rule id + version, exact inputs, amounts as strings); older records have none | Submitted versions display the snapshot when present; legacy records show amounts worked out from **their own stored fields** with a note ("source: stored"); unrecoverable ones show no total and an integrity note |
| PDF | None | **BLOCKED**: a disabled button with its reason; no route; Print remains |
| Attachments | None a buyer can download | **BLOCKED**: stated on the page; nothing stored |
| Withdrawal with optimistic concurrency, outbox | Withdrawal was a conditional update + a direct notice | Rebuilt as one transaction (status change + outbox row), `expectedVersion` guard (viewing an older version cannot withdraw a newer offer), notice sent after commit |
| Audit | `security_events` | Reused (`supplier_quotation_revision_created`, existing submit / withdraw events); no message or quotation body is logged |
| Version-by-id route | n/a | Not added: `GET /api/supplier/quotations/[reference]?version=n` already is the validated version read (adding `/versions/[id]` would duplicate it) |

## Findings and decisions
- **Revise only the current version, only while it waits on the buyer** (SENT or REVISION_REQUESTED). An expired offer is still SENT and may be revised (the revision needs a new validity). Accepted (immutable; no amendment process exists, so the action is blocked with that explanation), rejected, withdrawn, draft and historical versions cannot. One revision draft at a time (Continue Draft is offered). A closed inquiry blocks revision.
- **Acceptance versus revision submission** is resolved by the conditional supersede inside the submit transaction (`status ∈ {SENT, REVISION_REQUESTED}` on the previous current version): if the buyer accepted first the submission is a 409 `BASE_CHANGED` and nothing is written; if the submission wins, the acceptance (which is conditional too) no longer matches. Tested in both orders and as a true race.
- **Compare** reads exactly two documents (index `supplier_reference_versions`), writes nothing, and reports currency changes as their own change with no numeric delta.
- **Never loaded**: full version history (summaries are paged by cursor), line items of non-selected versions, the catalogue.

## Defects found by testing and fixed
See the test report (the section "Findings during testing").
