# Page 30 — Comparison rules

Code: `compareBuyerQuotations` in `src/lib/quotations/service.ts`, `compatibility` in `quotationRules.ts`.

1. **Two to four** different quotations; fewer, more, or the same one twice is a 400.
2. Only the buyer's **own current versions**. A reference that is not theirs (or is a draft or unknown) makes the whole request a 404 with no hint which one failed.
3. **One inquiry only.** Quotations of different inquiries are refused (400 `DIFFERENT_INQUIRIES`).
4. **Compatibility is reported, not hidden:** different currency, unit or offered quantity produce a warning each and `priceComparable: false`; an expired quotation is flagged as no longer an open offer. Amounts of different currencies are not combined.
5. **"Differs" markers** are computed from the displayed values of each row; the page shows the word "Differs" (never colour alone).
6. **Missing values are `null`** and shown as "Not Provided". Nothing is defaulted.
7. **No ranking.** There is no score, no "best value", no "lowest price" label and no recommendation anywhere in the response or the page; when the offers are like for like the page says that the lowest price is not automatically the best offer. (Test E-03 searches the whole answer for ranking words.)
8. **Selecting quotations to compare changes nothing**: no status, no decision, no event. Test E-10 compares the stored documents byte for byte before and after.
9. Layout: a table at 900px and wider, one card per quotation below; same data.
