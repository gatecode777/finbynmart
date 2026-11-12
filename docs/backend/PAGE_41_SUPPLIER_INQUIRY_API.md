# Page 41 — API contract

All routes: session → `requireSupplierApi()` (401 / 403) → rate limit (reads: reserved limiter; **the send is a write: exact limiter, 30 per 10 minutes per user**) → service. The company is the session's; an inquiry is reachable only when `supplierKey ∈ the company's sellerKeys` — unknown, malformed and another seller's reference are the **same 404** and nothing is read for them. No `supplierKey`, `companyId`, `buyerId` or role parameter is ever read. Private, `no-store`.

| Route | Purpose |
|---|---|
| `GET /api/supplier/inquiries/[reference]` | the inquiry as recorded: title, the buyer's message, category, quantity, unit, delivery location, received time, real status label, the listing's specifications (generic label / value), the buyer's **business name only**, what is not captured, attachments unavailable (with reason), capabilities (`respond {available, reason}`, `quotation {kind: create / continue / view / unavailable, href, reason}`) |
| `GET /api/supplier/inquiries/[reference]/responses?limit=&cursor=` | this inquiry's conversation, newest first, **cursor-paged** (20 default, 50 max; cursor = `(createdAt, _id)`); a malformed or operator cursor is 422 |
| `POST /api/supplier/inquiries/[reference]/responses` | `{type: "RESPONSE" \| "CLARIFICATION", message, idempotencyKey}` (key may be the `Idempotency-Key` header) |
| `GET /api/supplier/inquiries/[reference]/activity` | real events, newest first, at most 50 (`truncated`) |
| `GET /api/supplier/inquiries/[reference]/quotations` | the company's current quotations for this inquiry (≤ 20), the Page 42 row shape |

## Send rules
Only `type`, `message`, `idempotencyKey` are accepted; **any other field (author, company, recipient, createdAt, status, attachments, messageId…) is a 422** naming it. Message: plain text, NFKC, control characters cleaned, 10–2,000 characters and "meaningful" (≥ 5 letters / digits and ≥ 3 distinct). Errors: 400 not a JSON object · 403 cross-site, or no `respondToInquiries` permission / suspended company · 404 not the company's inquiry · 409 `INQUIRY_CLOSED`, `NOT_ELIGIBLE` (guest inquiry: no buyer account), `IDEMPOTENCY_CONFLICT`, `CONFLICT` · 413 body over 24 kB · 422 `VALIDATION` · 429 · 503 safe message ("nothing was sent, you can retry safely").
Success: `201` (or `200` for a replay) `{ ok, message, data: { message {id, type, typeLabel, body, authorName, createdAt, createdLabel}, inquiry {status, statusLabel}, replayed, buyerNotice: "recorded" | "pending" | "not-recorded" } }`. The text says which: recorded / queued / **no in-app notice was recorded (the buyer's notification settings may be off)**. No e-mail is sent or claimed.

## Idempotency
Scope `(company, user, "inquiry.respond", key)` unique with a stored request hash and response. Same key + same content → the original result (200, `replayed:true`); same key + different content → 409. Six simultaneous identical sends produce one message, one outbox row and one notice. A different key is a deliberate new message.

## Not created (BLOCKED)
Attachment upload / download for inquiries, read receipts, buyer replies, editing or deleting a sent message, a "waiting for buyer" status.
