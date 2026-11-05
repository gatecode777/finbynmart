# Page 35 — Category attribute registry

Status: **no category specification registry exists in the project**, so none was invented. Hard-coding "textile fields" (GSM, width, weave) for every category would be exactly what the PRD forbids, and the catalogue does not hold those values for most products.

What the data does carry: every product's `specifications` are `{label, value, unit, group}`, so each attribute states its own group. `planSpecRows` (`src/lib/compare/comparisonRules.ts`) uses that as the registry:

- An attribute that **two or more** compared products have is a shared row, shown under its own group heading (ordered by how many products have it).
- An attribute that only **one** product has (typically because the products are in different categories) is listed under "Specific to one product", not forced onto the others as a row of Not Provided.
- With a **single** product every attribute is shown as it is.
- The same label in two groups is two rows; at most 16 specification rows are drawn; units come with the value.
- `compatibility.categoryCompatible` says whether all compared products share a category, and a notice explains when they do not ("only the attributes they share are compared").

If a real per-category registry is added later (key, label, category, order, formatter, unit, visibility, compatibility), `planSpecRows` is the single place to read it from; the PRD's rules (no irrelevant attributes, no false values) still apply. Tests: unit A-01 to A-05, integration D-17.
