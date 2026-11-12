# Page 42 — pricing rules

Page 42 **never calculates a price itself and accepts no amount from a client.** Every figure shown or exported comes from `totals()` in `src/lib/quotations/service.ts`, which calls `priceBreakdown()` in `src/lib/quotations/money.ts` on the saved snapshot.

- Money is integer minor units; arithmetic is BigInt; a percentage is basis points rounded half up to the minor unit; no floating point touches an amount. (CSV: `plainAmount` formats minor units as `123456.78` by integer division.)
- `subtotal = unit price × quantity`; `discount` = saved percent or amount (never above the subtotal); `taxable = subtotal − discount`; `tax` only when the quotation names one (otherwise "Not specified" and the total is labelled **Total before tax (no tax stated)**, never "final payable"); `charges` (freight, packing…) are the saved lines added after tax; `total = taxable + tax + charges`.
- Nothing is assumed: no GST rate, no inclusion rule, no freight, packaging, insurance, commission or fee.
- Currency is stored per quotation and shown with every amount. Different currencies are never added, compared or ranked, so there is **no amount sort** and no cross-currency total; the Currency filter is the way to look at one currency.
- Historical snapshots: the price comes from the quotation version, not the catalogue, so a catalogue price change moves nothing (test `E-15`; a version keeps its own price: `E-04`).
- Worked example in the suite (`E-02`): ₹740.00 × 1,000 = ₹7,40,000; 5% discount = ₹37,000; taxable ₹7,03,000; 12% GST = ₹84,360; freight ₹5,000 → **₹7,92,360.00**.
- Not built (no creator exists): validation of client-submitted line items and server recomputation on submit belong to Page 43; this page has no route that accepts an amount (PATCH → 405).
