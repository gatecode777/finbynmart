// Unit tests for src/lib/buyer/profileRules.ts (pure module).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/23-profile-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const m = await import(pathToFileURL(path.join(root, "src/lib/buyer/profileRules.ts")).href);
const { validatePersonalUpdate, validateCompany, checkPostalCode, checkExpiry, computeCompletion, BUSINESS_TYPES, DOCUMENT_TYPES, FORBIDDEN_PROFILE_FIELDS } = m;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const personal = (over = {}) => ({ name: "Asha Verma", designation: "Purchasing Manager", alternatePhone: { countryCode: "+91", number: "" }, alternateEmail: "", version: 0, ...over });
const P = (over, primary = "asha@example.com") => validatePersonalUpdate(personal(over), primary);

// ---- personal
let r = P({});
check("U-01 a valid update passes and trims", r.ok && r.value.name === "Asha Verma" && r.value.designation === "Purchasing Manager" && r.value.alternatePhone === null && r.value.alternateEmail === null && r.value.version === 0);
check("U-02 name: empty, 1 character, markup and 101 characters are refused", ["", "A", "<b>x</b>", "a".repeat(101), "12345"].every((name) => P({ name }).fields?.name));
check("U-03 international names are accepted", P({ name: "आशा वर्मा" }).ok && P({ name: "José Müller-Øster" }).ok);
check("U-04 designation is optional, trimmed, max 100, no markup", P({ designation: "" }).value?.designation === null && P({ designation: "  Head  of   Buying " }).value?.designation === "Head of Buying" && P({ designation: "x".repeat(101) }).fields?.designation && P({ designation: "a<b" }).fields?.designation);
check("U-05 an alternate phone is validated and normalised", P({ alternatePhone: { countryCode: "+91", number: "98765 43210" } }).value?.alternatePhone?.normalized === "+91 9876543210" && P({ alternatePhone: { countryCode: "+91", number: "123" } }).fields?.alternatePhone && P({ alternatePhone: { countryCode: "+999", number: "9876543210" } }).fields?.alternatePhone);
check("U-06 an empty alternate phone is simply none", P({ alternatePhone: { countryCode: "+91", number: "   " } }).value?.alternatePhone === null);
check("U-07 an alternate email is validated, lower-cased, and cannot repeat the primary one", P({ alternateEmail: "Other@Example.com" }).value?.alternateEmail === "other@example.com" && P({ alternateEmail: "nope" }).fields?.alternateEmail && P({ alternateEmail: " ASHA@example.com " }).fields?.alternateEmail);
check("U-08 version is required and must be a non-negative integer", ["x", -1, 1.5, null, undefined].every((version) => P({ version }).fields?.version));
check("U-09 every server-only field is refused, not ignored", FORBIDDEN_PROFILE_FIELDS.every((key) => P({ [key]: key === "role" ? "admin" : true }).fields?.[key]), FORBIDDEN_PROFILE_FIELDS.filter((key) => !P({ [key]: true }).fields?.[key]).join());
check("U-10 the primary email and mobile number cannot be sent (they change only through verification)", P({ email: "x@y.co" }).fields?.email && P({ phone: "9876543210" }).fields?.phone);
check("U-11 non-object bodies are refused without throwing", [null, undefined, "x", 5, [], true].every((v) => validatePersonalUpdate(v, "a@b.co").ok === false));

// ---- company
const company = (over = {}) => ({ legalName: "Verma Traders Pvt Ltd", businessType: "Private Limited", country: "India", state: "Rajasthan", city: "Jaipur", postalCode: "302018", ...over });
const C = (over, mode = "create") => validateCompany({ ...company(over), ...(mode === "update" ? { version: 1 } : {}) }, mode);
r = C({});
check("U-12 a valid company passes; optional fields become null", r.ok && r.value.displayName === null && r.value.website === null && r.value.postalCode === "302018" && r.value.country === "India");
check("U-13 legal name: required, 2 to 150 characters, no markup", ["", "A", "x".repeat(151), "<script>"].every((legalName) => C({ legalName }).fields?.legalName));
check("U-14 business type must be one of the approved list", C({ businessType: "Sole Hobby" }).fields?.businessType && C({ businessType: "" }).fields?.businessType && BUSINESS_TYPES.every((t) => C({ businessType: t }).ok));
check("U-15 website: accepts www and full URLs (normalised), refuses other schemes and junk", C({ website: "www.example.com" }).value?.website === "https://www.example.com" && C({ website: "http://example.co.in/" }).value?.website === "http://example.co.in" && ["javascript:alert(1)", "ftp://example.com", "not a url", "localhost"].every((website) => C({ website }).fields?.website));
check("U-16 year established: 1800 to this year", C({ yearEstablished: 1998 }).value?.yearEstablished === 1998 && C({ yearEstablished: 1799 }).fields?.yearEstablished && C({ yearEstablished: new Date().getFullYear() + 1 }).fields?.yearEstablished && C({ yearEstablished: "abc" }).fields?.yearEstablished);
check("U-17 India: PIN is six digits, not starting with 0", checkPostalCode("302018", "India").ok && !checkPostalCode("012345", "India").ok && !checkPostalCode("30201", "India").ok && !checkPostalCode("3020189", "India").ok && !checkPostalCode("ABC123", "India").ok);
check("U-18 other countries are NOT held to the Indian rule", checkPostalCode("SW1A 1AA", "United Kingdom").ok && checkPostalCode("10001", "United States").ok && checkPostalCode("0150", "Singapore").ok && !checkPostalCode("<>", "United States").ok);
check("U-19 the PIN rule follows the chosen country", C({ country: "India", postalCode: "SW1A 1AA" }).fields?.postalCode && C({ country: "United Kingdom", postalCode: "SW1A 1AA" }).ok);
check("U-20 unsupported country refused; empty country defaults to India", C({ country: "Atlantis" }).fields?.country && C({ country: undefined }).value?.country === "India");
check("U-21 company email validated", C({ companyEmail: "info@verma.example" }).value?.companyEmail === "info@verma.example" && C({ companyEmail: "bad" }).fields?.companyEmail);
check("U-22 description and addresses are length limited and markup free", C({ description: "x".repeat(1001) }).fields?.description && C({ registeredAddress: "x".repeat(201) }).fields?.registeredAddress && C({ operatingAddress: "<b>" }).fields?.operatingAddress);
check("U-23 verification state, owner, normalised name and documents can never be sent", ["verificationStatus", "ownerUserId", "legalNameNormalized", "documents", "companyId", "role"].every((key) => C({ [key]: "x" }).fields?.[key]));
check("U-24 an update must carry the version it was loaded at", validateCompany(company(), "update").ok === false && validateCompany({ ...company(), version: 3 }, "update").version === 3);

// ---- documents
check("U-25 expiry: optional, a real date, sensible range", checkExpiry("").ok && checkExpiry(undefined).value === null && checkExpiry("2030-05-31").value === "2030-05-31" && !checkExpiry("2030-02-30").ok && !checkExpiry("31-05-2030").ok && !checkExpiry("1980-01-01").ok && !checkExpiry("2200-01-01").ok);
check("U-26 six document types are accepted, none is required of every business", DOCUMENT_TYPES.length === 6 && DOCUMENT_TYPES.some((d) => d.value === "GST_CERTIFICATE") && DOCUMENT_TYPES.some((d) => d.value === "OTHER"));

// ---- completion
const base = { name: "Asha", designation: null, emailVerified: false, phoneVerified: false, company: null, documentCount: 0 };
const full = { name: "Asha", designation: "Buyer", emailVerified: true, phoneVerified: true, company: { exists: true, businessType: true, location: true, description: true }, documentCount: 2 };
check("U-27 weights add up to 100", computeCompletion(full).items.reduce((n, i) => n + i.weight, 0) === 100);
check("U-28 a new account with only a name is 10%", computeCompletion(base).percent === 10);
check("U-29 everything done is 100%, and missing items are listed", computeCompletion(full).percent === 100 && computeCompletion(base).items.filter((i) => !i.met).length === 7);
check("U-30 an unverified email or mobile number earns nothing, even though the fields are filled", computeCompletion({ ...full, emailVerified: false }).percent === 85 && computeCompletion({ ...full, phoneVerified: false }).percent === 85);
check("U-31 a company without business type or location earns only the company item", computeCompletion({ ...base, company: { exists: true, businessType: false, location: false, description: false } }).percent === 25);
check("U-32 documents count only when at least one exists; the description does not score (no reward for optional text)", computeCompletion({ ...base, documentCount: 1 }).percent === 25 && computeCompletion({ ...base, company: { exists: false, businessType: false, location: false, description: true } }).percent === 10);
check("U-33 each missing item names the tab where it is fixed", computeCompletion(base).items.filter((i) => !i.met).every((i) => ["personal", "company", "documents", "verification"].includes(i.tab)));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
