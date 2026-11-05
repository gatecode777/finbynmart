# Page 35 — Price and MOQ comparison rules

Code: `priceCompatibility`, `moqCompatibility`, `lowestIndexes` in `src/lib/compare/comparisonRules.ts`; the values come from the catalogue only (`pricing`, `moq`), never from the client.

1. **Same currency and same price unit, or no comparison.** Prices in different currencies, or per different units, are shown separately with a notice, nothing is emphasised, and nothing is converted: no exchange-rate service or unit-conversion policy exists. (Only INR exists in the data today.)
2. **The only emphasis is neutral:** when currency and unit match and every product has a usable price, the lowest listed (starting) price gets a "Lowest listed price" tag. Never "best", "cheapest" or "recommended"; ties share the tag; a missing, zero or negative price anywhere means no emphasis.
3. **Catalogue prices are estimates**, shown as "(estimated)" with a notice; a range is shown as a range and compared by its lower end.
4. **No total, no discount, no previous price:** no quantity is entered on this page so no total is computed; no discount or old price is drawn because no promotion or price history exists; bulk tiers and price-on-request do not exist in the data.
5. **MOQ:** shown with its own unit, never zero when missing ("Not Provided" when only some products state one, and the row is not drawn at all when none does). The lowest minimum order is tagged only when **every** product states one in the **same** unit. MOQ is never treated as a purchasable quantity.
6. Money is formatted with the catalogue formatter; no arithmetic is done on prices here (a comparison of two numbers only), so no rounding error can arise.

Tests: unit P-01 to P-04, M-01, M-02, N-01, N-02; integration D-11 to D-13, G-01g.
