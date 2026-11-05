# Page 30 — Price breakdown rules

Code: `src/lib/quotations/money.ts` (unit-tested in `docs/page-reports/tools/30-quotation-rules-unit-test.mjs`).

- **Money is stored as integer minor units** (paise, cents) and calculated with `BigInt`. No floating point is used for any amount. Percentages are stored in basis points (12% = 1200). Rounding is half-up, applied once per line; results above the safe range are refused instead of being shown wrong.
- **Order of calculation:** subtotal = unit price × offered quantity → discount (percentage of the subtotal, or a fixed amount that may not exceed it) → taxable amount = subtotal − discount → tax = taxable × rate (only if tax was saved) → additional charges (each saved with a label) → total.
- **No invented tax.** If the supplier saved no tax, the Tax row says "Not specified" and the total is labelled "Total before tax (no tax stated)". Lists and the comparison add "before tax". The site never assumes GST.
- **No invented discount or charge.** A missing discount shows "Not specified"; charges appear only when saved.
- **Currency** is shown with the symbol of the saved currency and Indian digit grouping for INR (₹7,92,360.00). Different currencies are never added or compared.
- **Worked example (test D-02):** 1,000 Meter × ₹740.00 = ₹7,40,000.00; 5% discount ₹37,000.00; taxable ₹7,03,000.00; GST 12% ₹84,360.00; freight ₹5,000.00; total ₹7,92,360.00.
- If the saved amounts cannot be calculated (negative, overflow, discount above subtotal) the breakdown shows an error line and no total instead of a guess.
