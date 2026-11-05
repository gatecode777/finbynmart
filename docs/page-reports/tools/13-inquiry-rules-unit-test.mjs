// Unit tests for src/lib/inquiries/rules.ts (pure module, imported directly: node strips the types).
// Run: node docs/page-reports/tools/13-inquiry-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const rules = await import(pathToFileURL(path.join(root, "src/lib/inquiries/rules.ts")).href);
const { INQUIRY_TYPES, INQUIRY_LIMITS, PHONE_COUNTRIES, BUYER_CANCELLABLE, canTransition, normaliseStatus, normaliseInquiryType, inquiryTypeNeedsProduct, canonicalUnit, checkMessage, checkLocation, checkName, checkEmail, checkPhone, checkCompany, hasConsent, isIdempotencyKey, REFERENCE_PATTERN, safeNext } = rules;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const eq = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const bad = (name, result, pattern) => check(name, result.ok === false && (!pattern || pattern.test(result.error)), JSON.stringify(result));
const good = (name, result, value) => check(name, result.ok === true && (value === undefined || JSON.stringify(result.value) === JSON.stringify(value)), JSON.stringify(result));

// ---------- types
eq("T-01 four inquiry types", INQUIRY_TYPES.map((t) => t.value), ["GET_BEST_QUOTE", "PRODUCT_INQUIRY", "GENERAL_INQUIRY", "BULK_REQUIREMENT"]);
check("T-02 only a product inquiry needs a product", inquiryTypeNeedsProduct("PRODUCT_INQUIRY") && !inquiryTypeNeedsProduct("GET_BEST_QUOTE") && !inquiryTypeNeedsProduct("GENERAL_INQUIRY") && !inquiryTypeNeedsProduct("BULK_REQUIREMENT"));
for (const wrong of ["product_inquiry", "QUOTE", "", null, undefined, 5, {}, "GET_BEST_QUOTE ", "ADMIN"]) check(`T-03 unsupported type ${JSON.stringify(wrong)} is refused`, normaliseInquiryType(wrong) === null);
eq("T-04 a known type passes through", normaliseInquiryType("BULK_REQUIREMENT"), "BULK_REQUIREMENT");

// ---------- units (the catalogue's alias function is stood in for here)
const keyOf = (u) => ({ pieces: "piece", pcs: "piece", kilograms: "kg", kilogram: "kg", meters: "meter", litres: "liter", litre: "liter", tons: "ton" }[u.trim().toLowerCase().replace(/[^a-z]/g, "")] ?? u.trim().toLowerCase().replace(/[^a-z]/g, ""));
eq("U-01 'Pieces' is the Piece unit", canonicalUnit("Pieces", keyOf), "Piece");
eq("U-02 'kg' / 'Kilograms' is Kilogram", [canonicalUnit("kg", keyOf), canonicalUnit("Kilograms", keyOf)], ["Kilogram", "Kilogram"]);
eq("U-03 'Litres' is Litre", canonicalUnit("Litres", keyOf), "Litre");
for (const wrong of ["parsec", "", "   ", null, 5, undefined]) check(`U-04 ${JSON.stringify(wrong)} is not an offered unit`, canonicalUnit(wrong, keyOf) === null);

// ---------- message
bad("M-01 empty message", checkMessage(""), /at least 10/);
bad("M-02 nine characters", checkMessage("123456789"), /at least 10/);
good("M-03 ten characters pass", checkMessage("1234567890"), "1234567890");
good("M-04 2000 characters pass", checkMessage("x".repeat(INQUIRY_LIMITS.messageMax)));
bad("M-05 2001 characters", checkMessage("x".repeat(INQUIRY_LIMITS.messageMax + 1)), /within 2,000/);
bad("M-06 only spaces", checkMessage("            "), /at least 10/);
bad("M-07 not a string", checkMessage(12345678901234), /at least 10/);
eq("M-08 line breaks are kept (one blank line at most)", checkMessage("first line here\n\n\n\nsecond line here").value, "first line here\n\nsecond line here");
eq("M-09 control characters are removed", checkMessage("hello\u0007 world, I need 100 pieces").value, "hello world, I need 100 pieces");
eq("M-10 markup is stored exactly as typed (it is rendered as text, never as HTML)", checkMessage("<script>alert(1)</script> need quote").value, "<script>alert(1)</script> need quote");
eq("M-11 special characters survive", checkMessage("Need 5% GST, size 10x12 & colour 'red' — ₹500/pc").value, "Need 5% GST, size 10x12 & colour 'red' — ₹500/pc");

// ---------- delivery location
good("L-01 empty is fine (optional)", checkLocation(""), undefined);
good("L-02 nothing given is fine", checkLocation(undefined), undefined);
eq("L-03 city and state", checkLocation("Jaipur, Rajasthan").value, { text: "Jaipur, Rajasthan" });
eq("L-04 a PIN code inside the text is kept separately", checkLocation("Jaipur 302001").value, { text: "Jaipur 302001", postalCode: "302001" });
eq("L-05 a bare PIN code", checkLocation("302001").value, { text: "302001", postalCode: "302001" });
bad("L-06 a PIN code cannot start with 0", checkLocation("012345"), /six digits/);
bad("L-07 a five-digit number is not a PIN code", checkLocation("30200"), /six digits/);
bad("L-08 a seven-digit number is not a PIN code", checkLocation("3020011"), /six digits/);
bad("L-09 markup is refused", checkLocation("<script>"), /letters, numbers/);
bad("L-10 too long", checkLocation("x".repeat(INQUIRY_LIMITS.locationMax + 1)), /within 100/);
good("L-11 accented and non-Latin letters pass", checkLocation("Zürich, Köln"));
good("L-12 ordinary punctuation passes", checkLocation("Plot 5/B, Sector-12 (West), Pune"));

// ---------- name
good("N-01 a normal name", checkName("Priya Sharma"), "Priya Sharma");
good("N-02 apostrophe, hyphen and dot", checkName("Mary-Anne O'Neil Jr."));
good("N-03 non-Latin name", checkName("राजेश कुमार"));
bad("N-04 one character", checkName("A"), /full name/);
bad("N-05 digits", checkName("Buyer 123"), /letters/);
bad("N-06 markup", checkName("<b>x</b>"), /letters/);
bad("N-07 starts with a symbol", checkName("-Priya"), /letters/);
bad("N-08 81 characters", checkName("A".repeat(81)), /full name/);
bad("N-09 empty", checkName(""), /full name/);
eq("N-10 spaces are collapsed", checkName("  Priya    Sharma ").value, "Priya Sharma");

// ---------- email
good("E-01 a normal address (lower-cased)", checkEmail("Buyer@Example.COM"), "buyer@example.com");
good("E-02 plus tag and subdomain", checkEmail("a.b+tag@mail.example.co.in"));
for (const wrong of ["", "plain", "a@b", "a@@b.com", "a b@c.com", "@example.com", "a@.com", "a..b@example.com", ".a@example.com", "a.@example.com", "a@example..com", "a@example.c", "a,b@example.com", "<a@example.com>", "a@b.com, c@d.com"]) bad(`E-03 invalid ${JSON.stringify(wrong)}`, checkEmail(wrong), /valid email/);
bad("E-04 255 characters", checkEmail(`${"a".repeat(245)}@example.com`), /valid email/);

// ---------- phone
good("P-01 Indian mobile", checkPhone("9876543210", "+91"), "+91 9876543210");
good("P-02 spaces, dashes and brackets are allowed", checkPhone("(98765) 43-210", "+91"), "+91 9876543210");
bad("P-03 Indian number starting with 5", checkPhone("5876543210", "+91"), /starts with 6, 7, 8 or 9/);
bad("P-04 nine digits for India", checkPhone("987654321", "+91"), /10 digits/);
bad("P-05 eleven digits for India", checkPhone("98765432101", "+91"), /10 digits/);
bad("P-06 letters", checkPhone("98765abcde", "+91"), /10-digit/);
bad("P-07 all the same digit", checkPhone("9999999999", "+91"), /real phone/);
bad("P-08 unknown calling code", checkPhone("9876543210", "+999"), /country code/);
bad("P-09 no calling code", checkPhone("9876543210", undefined), /country code/);
good("P-10 UAE nine digits", checkPhone("501234567", "+971"), "+971 501234567");
good("P-11 Singapore eight digits", checkPhone("91234567", "+65"), "+65 91234567");
bad("P-12 plus sign inside the number", checkPhone("+919876543210", "+91"), /10-digit/);
bad("P-13 empty", checkPhone("", "+91"), /10-digit/);
check("P-14 every offered country states a digit count", PHONE_COUNTRIES.every((c) => Number.isInteger(c.digits) && c.digits >= 8 && c.code.startsWith("+")));

// ---------- company
good("C-01 optional: empty", checkCompany(""), undefined);
good("C-02 a company name", checkCompany("Acme Traders Pvt. Ltd."), "Acme Traders Pvt. Ltd.");
bad("C-03 101 characters", checkCompany("A".repeat(101)), /within 100/);

// ---------- consent
check("K-01 only an explicit true is consent", hasConsent(true) === true);
for (const wrong of [false, "true", 1, "on", "yes", null, undefined, {}, [], "1"]) check(`K-02 ${JSON.stringify(wrong)} is not consent`, hasConsent(wrong) === false);

// ---------- idempotency key and reference
for (const ok of ["a".repeat(16), "abcDEF0123456789_-xyz", "550e8400-e29b-41d4-a716-446655440000"]) check(`I-01 key accepted: ${ok.slice(0, 20)}`, isIdempotencyKey(ok));
for (const wrong of ["short", "a".repeat(15), "a".repeat(65), "has space 123456789", "semi;colon1234567890", "<script>1234567890", "", null, 12345678901234567, undefined]) check(`I-02 key refused: ${String(wrong).slice(0, 20)}`, !isIdempotencyKey(wrong));
check("I-03 reference format FBM-INQ-XXXXXXXX (Crockford base32)", REFERENCE_PATTERN.test("FBM-INQ-7K3M9PQR") && !REFERENCE_PATTERN.test("FBM-INQ-7K3M9PQ") && !REFERENCE_PATTERN.test("FBM-INQ-7K3M9PQI") && !REFERENCE_PATTERN.test("fbm-inq-7k3m9pqr") && !REFERENCE_PATTERN.test("FBM-INQ-00000001X"));

// ---------- status lifecycle
const all = ["NEW", "NOTIFIED", "IN_PROGRESS", "REPLIED", "QUOTED", "CLOSED", "CANCELLED", "REJECTED"];
check("S-01 terminal statuses allow nothing", ["CLOSED", "CANCELLED", "REJECTED"].every((s) => all.every((t) => !canTransition(s, t))));
check("S-02 nothing moves back to NEW", all.every((s) => !canTransition(s, "NEW")));
check("S-03 no status moves to itself", all.every((s) => !canTransition(s, s)));
check("S-04 the main path is allowed", canTransition("NEW", "NOTIFIED") && canTransition("NOTIFIED", "IN_PROGRESS") && canTransition("IN_PROGRESS", "REPLIED") && canTransition("REPLIED", "QUOTED") && canTransition("QUOTED", "CLOSED"));
check("S-05 a reply cannot be un-sent into NEW, cancelled or rejected", !canTransition("REPLIED", "CANCELLED") && !canTransition("REPLIED", "REJECTED") && !canTransition("QUOTED", "CANCELLED"));
eq("S-06 the buyer may cancel only before a reply", BUYER_CANCELLABLE, ["NEW", "NOTIFIED", "IN_PROGRESS"]);
check("S-07 every buyer-cancellable status can really move to CANCELLED", BUYER_CANCELLABLE.every((s) => canTransition(s, "CANCELLED")));
check("S-08 and no other status can be cancelled by the buyer", all.filter((s) => !BUYER_CANCELLABLE.includes(s)).every((s) => !canTransition(s, "CANCELLED") || s === "NEW"));
eq("S-09 older records saying 'new' read as NEW", [normaliseStatus("new"), normaliseStatus("NEW"), normaliseStatus(undefined)], ["NEW", "NEW", "NEW"]);
eq("S-10 unknown stored values fall back to NEW, known ones are kept", [normaliseStatus("bogus"), normaliseStatus("replied"), normaliseStatus("CANCELLED")], ["NEW", "REPLIED", "CANCELLED"]);
check("S-11 transitions from an unknown status are refused", canTransition("BOGUS", "NEW") === false);

// ---------- safe return path
for (const ok of ["/inquiry/shree-textiles", "/inquiry/shree-textiles?product=cotton-fabric", "/account/inquiries", "/suppliers/x/products?page=2&sort=a-b", "/"]) check(`R-01 return path accepted: ${ok}`, safeNext(ok) === ok);
for (const wrong of ["//evil.com", "https://evil.com", "http://evil.com/x", "javascript:alert(1)", "/\\evil.com", "\\evil.com", "evil.com", "", "/sign-in?next=/x", "/sign-up", "/api/auth/logout", "/a b", "/x<script>", "/x#frag", "/" + "a".repeat(301), null, undefined, 5]) check(`R-02 return path refused: ${String(wrong).slice(0, 30)}`, safeNext(wrong) === null);

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.join("\n"));
  process.exit(1);
}
