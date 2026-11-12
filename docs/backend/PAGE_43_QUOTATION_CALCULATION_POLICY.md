# Page 43 — quotation calculation policy (policy version `2026-11-12.1`)

One calculation, shared by the browser preview and the server: `computeQuote()` in `src/lib/quotations/quoteRules.ts`, built on the existing exact-integer `priceBreakdown()` (`src/lib/quotations/money.ts`) and the decimal text helpers in `src/lib/quotations/decimal.ts`. The server recalculates every authoritative amount on every save-preview and on submission; a total sent by a client is only ever **compared** (to detect a change) and never stored.

## Representation
- At the API boundary an amount is a **decimal string** with two decimals (`"120.00"`); responses return amounts as strings with an explicit currency. No amount is ever a JavaScript float and no BigInt is serialised.
- Internally an amount is a whole number of minor units (paise, cents) that must stay a safe integer; arithmetic is BigInt (money.ts). Parsing is by text (`parseMoney`): 1–12 integer digits, optional `.d` or `.dd`. A sign, exponent, separator, hex, a third decimal place, or anything else is **refused, not rounded**.
- Currency scale: 2 decimal places for every supported currency (INR, USD, EUR, GBP, AED, SGD; the same list `formatMoney` knows). One currency per quotation; no exchange rate exists or is invented.
- Quantity: a **whole number** 1 … 1,000,000 (the quotation model stores whole quantities; fractional quantities are refused, never rounded). Percentages: text with at most 2 decimals, held as basis points, 0 … 100.
- Limits: unit price and each charge at most 1,000,000,000.00; the line subtotal must stay under half of the maximum safe integer (an overflow is refused with "The amount is too large").

## Calculation order
1. `subtotal = unit price × quantity`
2. `discount` = the saved percent of the subtotal (half up to the minor unit) **or** the saved amount; never more than the subtotal
3. `taxable = subtotal − discount`
4. `tax` = the **configured** rule's rate on the taxable amount, half up to the minor unit, **once, at the tax line**; an explicit EXEMPT / NOT_APPLICABLE rule gives tax `0.00`
5. `charges` = freight + approved additional charges (≤ 3, each named), **added after tax and not taxed**
6. `total = taxable + tax + charges`

Rounding: half up, applied only to the percentage discount and the tax line (every other step is exact integer arithmetic). Freight and additional charges are not taxed in this policy; a rule that needs taxable freight is not supported and must be added with a policy-version change.

## What is NOT in the code
No GST rate, exemption, HSN/SAC classification, place-of-supply rule or CGST/SGST/IGST split. Tax treatments come only from the platform configuration `QUOTATION_TAX_RULES` (JSON; see below). **Missing configuration is different from an explicit zero treatment**: with no rule selected the page shows a provisional amount "before tax" and **Pending tax review**, never a final total, and submission is refused (422 `TAX_UNRESOLVED` when nothing is configured at all).

## Configuration
`QUOTATION_TAX_RULES='[{"id":"gst-18","version":"2026-04","label":"GST 18%","kind":"RATE","ratePercent":"18"},{"id":"exempt","version":"1","label":"Exempt","kind":"EXEMPT"}]'`. `kind` is RATE (needs `ratePercent`), EXEMPT or NOT_APPLICABLE. A malformed entry is ignored and logged by position. The id **and version** of the selected rule are stored on the submitted snapshot; a rule whose version changed after review makes submission a 409 `TAX_POLICY_CHANGED` with the new calculation. The test fixture (`TEST-NOT-APPLICABLE`, `TEST-RATE-18`) exists only in the test environment.

## Illustrative fixture (tests only)
500 m × ₹120.00 = ₹60,000.00; discount ₹0.00; freight ₹1,500.00; with the explicit non-taxable TEST rule: total **₹61,500.00**; without a rule: provisional ₹61,500.00, no final total. The fixture is not a production rule.

## Submission snapshot
`quotations.snapshot`: `policyVersion`, `taxRule {id, version, kind, label, bp}`, `input` (the exact decimal strings entered), `amounts` {subtotal, discount, taxable, tax, freight, otherCharges, total} (strings), `submittedAt`. A later change to the catalogue, the company profile or the tax configuration never changes a submitted quotation.
