# Company verification policy (`VERIFICATION_POLICY`)

Company verification is a **platform review of business evidence** a supplier submits for its company. The business owns the policy; the application ships **no default**. Until `VERIFICATION_POLICY` is set to a valid JSON object:

- suppliers cannot submit evidence (the Verification tab says the policy is not configured);
- reviewers can open already-submitted applications (read-only) but **cannot approve** (the page names the missing configuration);
- nothing is ever verified.

The value is read on every request (no restart cache). Set it in `.env.local` / the host environment as one line of JSON.

## Decisions the business must make (the application will not guess them)
1. **Which evidence is required** (`requiredDocumentTypes`) and which is optional. No statutory document is assumed; no personal ID or bank detail is ever required.
2. **Which business types** the policy applies to (`businessTypes`; empty = all).
3. **The review criteria** a reviewer confirms (`checklist`). They are reviewer input, never proof.
4. **The approved decision reasons** for approve / request changes / reject, each with the **supplier-visible message** (`reasons`). Internal reviewer notes are separate and are never shown to the supplier.
5. **Which identity fields are material** (`materialIdentityFields`): if one changes after approval, the public label is withheld until a new submission is reviewed (the stored approval is not deleted or revoked).
6. **Whether an approval expires** (`approvalExpiryMonths`; omit for none).
7. **Whether a supplier may resubmit after a rejection** (`resubmitAfterReject`, required true/false).

## Shape
```json
{
  "version": "v1",
  "businessTypes": [],
  "requiredDocumentTypes": ["..."],
  "optionalDocumentTypes": [],
  "checklist": [{ "key": "snake_case_key", "label": "Criterion shown to the reviewer" }],
  "reasons": {
    "approve": [],
    "requestChanges": [{ "code": "UPPER_SNAKE", "label": "Reviewer label", "message": "Text the supplier sees" }],
    "reject": [{ "code": "UPPER_SNAKE", "label": "Reviewer label", "message": "Text the supplier sees" }]
  },
  "materialIdentityFields": ["businessName"],
  "approvalExpiryMonths": 24,
  "resubmitAfterReject": true
}
```
Document types: `GST_CERTIFICATE`, `PAN_DOCUMENT`, `INCORPORATION_CERTIFICATE`, `MSME_UDYAM`, `TRADE_LICENSE`, `FACTORY_LICENSE`, `ADDRESS_PROOF`, `OTHER`. Identity fields: `businessName`, `displayName`, `businessType`, `country`, `state`, `city`. The values above are placeholders showing the shape only: they are **not** the business's policy.

## Versioning
A submission stores a **copy of the policy it was made under** (`policy.version` and the full rules). A reviewer decides it under those rules even if the environment changes later; a new submission uses the then-current policy. Change `version` whenever the rules change. Removing the policy blocks new submissions and approvals (read-only inspection stays).
