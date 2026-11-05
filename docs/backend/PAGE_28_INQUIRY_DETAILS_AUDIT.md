# Page 28 — Inquiry Details: audit before implementation

Checked against the repository on 2026-11-04. The platform audit said inquiry, quotation and messaging were incomplete; this verifies what exists today.

| Module the PRD names | State in the code | Consequence |
|---|---|---|
| Inquiries | **Exists**: collection `inquiries`, reference generation, ownership by `buyerId`, statuses, `statusHistory`, cancellation, buyer API, confirmation page with a timeline builder | Built on, nothing duplicated |
| Supplier responses | **Does not exist**: no model, collection, route or supplier inbox; suppliers cannot log in to anything that reads inquiries | Responses tab and counts: honest "not connected / Not available yet" |
| Quotations | **Does not exist**: no collection, no route, no status, no versions | Quotations tab, history, compare, revision, selection: not offered; BLOCKED |
| Messaging | **Does not exist** (no model, API or realtime) | Messages tab: "Messaging is not available yet"; BLOCKED |
| Attachments / files | The inquiry form has no upload and the record has no file field. Private storage exists only for a buyer's company documents (Page 23, KYC type): those must never be exposed here. No ImageKit | Attachments section: "No attachments"; BLOCKED |
| Event history | Only `statusHistory` (submission, cancellation; other statuses reserved). No supplier-notification events (`notification.status` is always BLOCKED) | Timeline shows only recorded steps; the notification line is text, not a completed step |
| Orders / checkout / selection | Do not exist | Select & Proceed: not offered; BLOCKED |
| PDF generation | None | Print stylesheet via the browser (which can save a PDF); PDF export BLOCKED |
| Notifications to suppliers | None (a buyer-side in-app notice exists, Page 26) | Cancel creates none for the supplier and does not claim one |
| Target price, required-by date, requirement title, currency | Not collected by the inquiry form, so not stored | Not shown (no placeholder values) |
| Multi-supplier distribution | None: one supplier per inquiry | "Suppliers Invited" and "Primary Supplier" are not shown; the page says it went to this one supplier |

## Decisions
1. **One detail builder:** `getBuyerInquiryDetail` extends the Page 14 confirmation DTO (`toConfirmationDto`: supplier, product with gone-product handling, timeline from history, notification wording) with updated time, history, category, cancel eligibility and capability flags.
2. **Route names:** the page folder is `[reference]`; the API folder stays `[id]` (Next does not allow two different dynamic names at one level); it accepts a reference, or the id of an old record that has no reference.
3. **API surface:** the existing `GET /api/buyer/inquiries/[id]` gains `?view=detail`; cancel is reused. The PRD's other endpoints (`/timeline`, `/attachments`, `/export`, `/responses`, `/quotations`, `/messages`, `/select-quotation`, `/revision-request`, `/api/buyer/quotations/[id]`) are **not created**: each would front data that does not exist, and CLAUDE.md forbids inventing endpoints. The timeline is part of the detail answer.
4. **No database changes** beyond Page 27's.
5. **Capability flags** in the DTO are literal `false` types for everything that does not exist, so a future module has to change the type and the UI together.

## Security gaps found
Private message text is returned by the detail route to its owner (intended); the old detail route had no role check (fixed); a `/account/inquiries/[id]` page never existed.
