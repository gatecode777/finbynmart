# Page 22 security report

| Control | Result | Test |
|---|---|---|
| Authentication required (API 401, page redirect to sign-in and back) | Pass | A-01, A-07 |
| Role check (supplier: API 403, page "Buyer accounts only") | Pass | A-02, A-08 |
| Suspended buyer, forged and expired session refused | Pass | A-03, A-04, A-06 |
| Buyer A sees only A's inquiries, B only B's; no cross leakage of references, messages, suppliers | Pass | B-01, B-02 |
| `buyerId`, `userId`, `buyer` query parameters and an `x-buyer-id` header ignored | Pass | B-03, B-04 |
| Replaying another buyer's cookie shows only that cookie's data | Pass | B-05 |
| Guest inquiries never counted or shown | Pass | B-06 |
| Saved items counted per buyer | Pass | B-08 |
| Private, no-store responses | Pass | B-09 |
| No email, phone, hash, session data or message text in answers | Pass | B-10, G-02 |
| Date-range input validated server side (7 invalid forms refused with 400) | Pass | D-01 |
| Rate limit (120 a minute per buyer, block-reserved) | Implemented; 429 behaviour hit during the benchmark and the limit lifted for the measurement; not asserted as its own check | the perf run |
| No raw query operators from clients: parameters are parsed to presets and dates only | by design | D-01 |

Not verified: HTTPS and `secure` cookie behaviour; admin accounts (no admin role exists); quotations, orders, cart and notifications isolation (no such data or endpoints); Firefox and Safari; third-party review. The dashboard has no write endpoints.
