# Page 23 — Buyer Profile & Company: implementation report

**Status:** Implemented; behaviour verified on the throwaway database; QA not complete. **BLOCKED / NOT AVAILABLE:** mobile verification (no SMS service), changing the primary email or mobile number (no verification workflows), profile photograph (no image pipeline or ImageKit), company verification and document review (no admin or review process), company members and roles (single owner), device/session list, durable document storage in production.

**Audit:** `docs/backend/PAGE_23_BUYER_PROFILE_AUDIT.md`.
**Frontend:** `src/app/buyer/profile/page.tsx`, `src/components/buyer/profile/*` (header, tabs, unsaved-changes guard, Personal, Company, Documents, Verification, Security, side summary), shell updates (Profile & Company link live; RFQ and Saved removed from the top bar at the owner's request).
**Backend:** `src/lib/buyer/{profileRules,profile,documentStorage,api}.ts`, routes `/api/buyer/{profile,company,company/documents,company/documents/[id],verification,verification/email/resend,security}` and `/api/auth/change-password`, `changePasswordHash` in `users.ts`.
**Schema:** new `companies` and `company_documents` (indexes in the data model note); `users` gained `designation`, `alternatePhone`, `alternateEmail`, `profileVersion`, `companyId`, `passwordChangedAt`. `security_events` reused.
**Rules:** ownership (single owner, no claiming), documents (type, content, size, private streaming), verification (reported only), completion (weighted, honest: max 85% until mobile verification exists), password change (shared hashing and policy; other devices signed out).
**Results:** 33/33 unit, 102/102 browser and API, 4/4 no-storage. Reads p95 96-225 ms; profile write p95 427 ms.

**Gaps:** the blocked items above; no virus scanning; Lighthouse, contrast, Firefox/Safari, landscape, zoom not run; no large-history performance test; documents page not tested with a hosted store; reference photo and date of birth/gender intentionally not built.
**Tracker:** row 24 (Buyer Profile) updated, route now `/buyer/profile`.
