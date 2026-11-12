# Page 45 — Supplier Orders: security report (2026-11-12)

## 1. Authentication & Role Boundaries
- **Portal Protection**: All `/supplier/orders` routes enforce valid session cookies via `auth_sessions`.
- **Role Enforcement**: Unauthenticated visitors are redirected to `/sign-in`. Requests authenticated under the `buyer` role receive a strict `403 Forbidden` JSON response on API routes and an automatic redirect to `/forbidden?portal=supplier` on pages.
- **Company Status Check**: Suspended supplier companies (membership revoked or inactive) receive `403 Forbidden` across all order endpoints.

## 2. Multi-Tenant Isolation
- **Supplier Key Scoping**: The supplier company's platform-assigned `sellerKeys` are extracted strictly from the server-side session and company record (`req.supplierCompany.sellerKeys`).
- **No Forged Ownership**: Any client-supplied parameters attempting to pass `supplierKey`, `supplierId`, `companyId`, or `buyerId` in query strings or request bodies are strictly ignored.
- **Identical 404 Behavior**: Requests attempting to view an order belonging to another supplier, an unknown order reference, or a malformed reference return the exact same 404 response without leaking whether the reference exists.
- **Cross-Record Link Privacy**: On the order detail page, links to quotations and inquiries are only rendered if those related records belong to the same supplier. Orders referencing other suppliers' quotations render references as plain text without hyperlinks.

## 3. Buyer Privacy & Data Protection
- **No Private Buyer Identifiers**: The supplier order DTO strips internal buyer IDs (`buyerId`), buyer login credentials, buyer phone numbers, and buyer email addresses. Only the official business entity name (`buyer.businessName`) or `"Individual buyer"` is surfaced.
- **Plain Text Sanitization**: Buyer cancellation reasons and inquiry notes are sanitized and rendered strictly as escaped plain text to prevent stored XSS injection.

## 4. State-Changing Security & CSRF
- **Same-Origin Verification**: The `POST /api/supplier/orders/export` endpoint verifies `Origin` and `Sec-Fetch-Site` headers via `verifySameOrigin` to reject cross-site forged requests.
- **Rate Limiting**: Synchronous export requests and read queries are protected by bounded rate limiters stored in `rate_limits`.
- **CSV Formula Injection Mitigation**: All exported CSV cells defuse leading formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote and wrapping values in standard RFC 4180 double quotes.

