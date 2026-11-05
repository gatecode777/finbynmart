# 07 — Buyer Workflow Audit

Legend: ✅ works end to end · ◐ partial · ❌ missing. "Verified" means read from code; only the homepage was rendered this session.

| # | Step | UI | API | DB persistence | Validation | Auth | Notifications | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | Open homepage | ✅ | n/a | n/a | n/a | n/a | n/a | ✅ |
| 2 | Search a product | ✅ (hero + header search → `/search`) | in-process | CSV | basic | none | – | ◐ test data, no autocomplete |
| 3 | Browse categories | ✅ | none | sample constants | – | – | – | ◐ UI only |
| 4 | Open product detail | ✅ | in-process | CSV | – | – | – | ◐ estimated price/sizes |
| 5 | Discover supplier | ✅ link from product | in-process | CSV | – | – | – | ◐ fictional sellers |
| 6 | Open supplier profile | ✅ | in-process | CSV | – | – | – | ◐ |
| 7 | Submit inquiry or requirement | ✅ form | **stub returns error** | **none** | client | none | none | ❌ |
| 8 | Receive confirmation | ❌ (form shows "not connected") | – | – | – | – | – | ❌ |
| 9 | Supplier receives the lead | ❌ | – | – | – | – | – | ❌ |
| 10 | Supplier replies with a quotation | ❌ | – | – | – | – | – | ❌ |
| 11 | Buyer compares quotations | ❌ | – | – | – | – | – | ❌ |
| 12 | Buyer ↔ supplier communication | ❌ | – | – | – | – | – | ❌ |
| 13 | Manage saved suppliers / inquiries | ❌ no pages | – | – | – | – | – | ❌ |

Side journeys: sign-up ✅ (real account), sign-in ✅, sign-out ✅, forgot/reset password ❌, email verification ❌, buyer dashboard ❌.

## Summary
Steps 1–6 are browsable discovery on test data. The commercial core (steps 7–13) does not exist. A buyer cannot actually reach any supplier through the platform today.

## Missing connections
Requirement/inquiry API + collections; lead routing to suppliers; buyer dashboard; quotation model; messaging; notifications (email + in-app); duplicate/spam controls.
