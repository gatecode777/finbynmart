# Page 39 — Supplier Dashboard: KPI and data rules

Route `/supplier/dashboard` (tracker row 35). Code: `src/lib/supplier/{company,dashboardRules,dashboardService}.ts`, `src/app/supplier/dashboard/page.tsx`, `src/components/supplier/dashboard/{SupplierDashboard,PerformanceChart}.tsx`, APIs `GET /api/supplier/dashboard` and `/performance`. Tests: `docs/page-reports/tools/39-supplier-dashboard-test.mjs`.

## Tenancy
The company is the one the session's account owns (`resolveSupplierContext`, one login per company: the owner). `supplier_companies.sellerKeys` are the sellers it owns; every number below is scoped `supplierKey ∈ sellerKeys`. `sellerKeys` starts empty and only the platform changes it (no self-claim), so a new company sees genuine zeros and the page says why. `companyId`, `supplierKey` and similar parameters are never read.

## KPI definitions (one definition each)
| Card | Definition | Scope |
|---|---|---|
| Total Inquiries | inquiries addressed to the company's sellers created in the period | period, with change vs the previous period of equal length |
| Pending Responses | inquiries still awaiting a response (`NEW`, `NOTIFIED`, `IN_PROGRESS` and legacy `new`) | now |
| Active Quotations | current version, `SENT` or `REVISION_REQUESTED`, valid now (never drafts, superseded, withdrawn, accepted, rejected, expired) | now |
| Confirmed Orders | orders placed in the period that left `PENDING_CONFIRMATION` and are not `CANCELLED` | period, with change |

Periods: 7d, 30d (default), 90d, this-month, previous-month, custom (both dates, start ≤ end, end not in the future, ≤ 366 days), all in India time. Chart: inquiries by arrival day, quotations by the day their FIRST version was sent (a revision is not a new quotation), orders by placement day.

## Not available (shown as unavailable with a reason, never zero)
Average response time (no supplier reply is recorded), supplier notifications, product approval / draft states, replying to inquiries, adding products, quotation creation. Profile completion counts only fields the site can capture; it is never "verification" (status is always "Not verified"). Buyers appear by registered business name only.

## Page
Company card, period selector, four KPI cards, performance chart (own route, so a slow chart never blocks the rest), recent inquiries (table ≥ 900 px, cards below; references are text because the supplier inquiries page does not exist), business snapshot, top products by inquiries, "Not available yet" list. Each section loads independently; a failed one shows an error and the others render.
