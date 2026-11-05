# Page 35 — Difference highlighting

`rowStatus` (`src/lib/compare/comparisonRules.ts`) gives every row one status across the live products:

| Status | Meaning | Shown |
|---|---|---|
| `same` | every product states the same value (case and spacing ignored) | neutral |
| `differs` | at least two products state different values | "Differs" mark and a highlighted cell when Highlight differences is on |
| `incomplete` | the products that state a value agree, but at least one does not state it | the missing cell reads **Not Provided**; not highlighted as a difference, never zero |
| `empty` | no product states it | **the row is not drawn**; its label is listed under "Not available for these products, so not shown" |

Controls (client side, no server round trip, nothing stored): **Highlight differences** (on by default) turns the marks and cell highlights on and off; **Show differences only** hides the `same` rows (the page says how many are hidden; rows with a Not Provided value stay visible because information is missing there). Both are checkboxes with visible labels; the mark is a word, not colour alone.

Nothing is scored or ranked, text is not compared with invented scores, and different units are not normalised. Tests: unit S-01 to S-04; integration D-15, G-01d.
