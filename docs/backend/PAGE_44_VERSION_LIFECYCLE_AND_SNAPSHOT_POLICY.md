# Page 44 — version lifecycle, snapshot policy and consistency

## Version model (existing, extended additively)
One document per version; `reference` is the quotation identity. Fields added (optional): `revisionOf` (base version), `revisionReason`. A version's states: **DRAFT** (not current when it is a revision), **SENT / REVISION_REQUESTED** (current offer, waiting on the buyer), **SUPERSEDED** (replaced by a newer submitted version), **ACCEPTED**, **REJECTED**, **WITHDRAWN**; expiry is derived from `validUntil` at read time and never stored. No status was added or renamed.

| Event | Effect |
|---|---|
| Create Revision (base = current, SENT / REVISION_REQUESTED) | inserts version N+1: `DRAFT`, `isCurrent:false`, `revisionOf`, `revisionReason`, `draft.input` = a copy of the base's exact submitted inputs, no `openKey`, no events. **The base is not modified; the buyer is not told** |
| Edit / preview / submit | Page 43 routes (revision guard, tax rules, server calculation) |
| Submit the revision (one transaction) | previous current → `SUPERSEDED`, `isCurrent:false`, `$unset openKey`, event `SUPERSEDED`; revision → `SENT`, `isCurrent:true`, the carried `openKey`, snapshot, event `SENT`; inquiry steps (none: already QUOTED); outbox `QUOTATION_REVISED`; idempotency record. If the previous current is no longer SENT / REVISION_REQUESTED (the buyer decided, or it was withdrawn) → 409 `BASE_CHANGED`, nothing written |
| Withdraw (current only) | transaction: conditional `→ WITHDRAWN` + event + `$unset openKey` + outbox `QUOTATION_WITHDRAWN` |
| Buyer accept / reject / request revision | the existing buyer routes, unchanged; conditional on status, so they lose to an already committed supplier action and win over a later one |

## Snapshot policy
- A **submitted version is immutable.** No route edits it. Its commercial data is its own: the mirror fields (`unitPriceMinor`, `charges`, `terms`…) and, for versions made by the create workflow, `snapshot` (policy version, tax rule id + version + kind, exact input strings, amounts as decimal strings).
- The detail shows a version **from its own stored data**: amounts from the snapshot when present; for an older record, **worked out from its own stored fields** with a visible note; if even that fails, **no total** and an integrity note. Today's catalogue, tax configuration, rounding policy and company profile are never consulted for a submitted version. The current product listing is linked separately ("may differ from what was quoted").
- A revision **copies** the base version's inputs (never catalogue prices); it requires the supplier to re-review the price, the tax treatment (the rule may have changed: an unknown rule blocks submission) and a new validity.
- Accepted versions stay immutable and are never superseded, revised or withdrawn here; amendment is BLOCKED (no approved process).

## Consistency
Single-document conditional updates where one document is enough (drafts, buyer decisions); **transactions** where several documents change together: revision submission (previous current + revision + inquiry + outbox + idempotency), revision creation (draft + idempotency), withdrawal (quotation + outbox). Verified on the Atlas deployment; there is no partial-commit fallback. Duplicate protection: the unique `(reference, version)` index (two simultaneous revisions cannot both create version N+1), the unique idempotency scope, and the unique outbox `dedupeKey`.

## Indexes (reviewed, none added for this page)
`supplier_reference_versions (supplierKey, reference, version −1)` serves the version page, the cursor page, the selected-version read and the two-version compare; `quotation_version (reference, version)` unique; `supplier_current_*` for the list; `quotation_open_per_inquiry` unique partial (carried from the superseded version to the revision, never two holders). Query plans at 45 versions are in the performance report.
