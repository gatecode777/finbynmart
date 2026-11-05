# 08 — Supplier Workflow Audit

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | Supplier registration | ◐ | `/register-supplier` → `/api/auth/register` with `role:"supplier"`; stores business name, phone, city, offering inside the `users` document |
| 2 | Login | ◐ | Shared `/sign-in`; no supplier-specific redirect or dashboard |
| 3 | Company profile setup | ❌ | No page, no entity |
| 4 | Business details submission | ❌ | Registration collects four fields only (no GST/PAN, address, certifications, year established, employees) |
| 5 | Verification / KYC | ❌ | No documents, no approval workflow; "Verified" badges across the site are sample/sample-seller flags, never a real check |
| 6 | Product listing | ❌ | Products come from a CSV; suppliers cannot create or own products |
| 7 | Product image upload | ❌ | No upload endpoint or storage |
| 8 | Product editing | ❌ | |
| 9 | Lead reception | ❌ | Requirement/inquiry forms are unconnected |
| 10 | Inquiry management | ❌ | |
| 11 | Quotation submission | ❌ | |
| 12 | Buyer communication | ❌ | |
| 13 | Subscription management | ❌ | `/supplier-membership` and `/pricing` are placeholder pages |
| 14 | Performance analytics | ❌ | |

## Summary
Only step 1 (and the shared login) is real. A supplier can create an account but cannot do anything after signing in. The catalog's 1,200 "suppliers" are fictional records unrelated to registered users; there is no link between a registered supplier account and a catalog seller.
