# Page 35 — Unit compatibility

- **Price unit:** compared case-insensitively and whitespace-insensitively ("Piece" equals "piece"). Different units mean "not like for like": no price emphasis, a notice, and the original units stay visible in the Price Per row. There is no unit-normalisation table (metres to yards, kilograms to tonnes), so none is attempted.
- **MOQ unit:** the same rule; different units, or any product without a minimum order, means the lowest minimum order is not pointed out.
- **Specification units** travel with the value ("120 GSM"); text values are compared as normalised text (case and spacing ignored), numbers are not parsed or converted, so "58 inch" and "147 cm" read as different, honestly, rather than guessed equal.
- **Currency:** only INR exists; different currencies would be listed independently with a notice and never converted.
- A missing value is never zero and never a difference by itself (see `PAGE_35_DIFFERENCE_HIGHLIGHTING.md`).

Tests: unit P-02, P-03, M-02, S-02; integration D-13.
