// Unit tests for src/lib/buyer/addressRules.ts (pure module).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/24-address-rules-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const m = await import(pathToFileURL(path.join(root, "src/lib/buyer/addressRules.ts")).href);
const { validateAddress, parseAddressQuery, toAddressSnapshot, locationText, ADDRESS_PURPOSES, MAX_ADDRESSES } = m;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const base = (over = {}) => ({ label: "Head Office", purposes: ["BUSINESS", "BILLING"], contactPerson: "", companyName: "", phone: { countryCode: "+91", number: "" }, addressLine1: "A-102 Trade Centre, Tonk Road", addressLine2: "", landmark: "", country: "India", state: "Rajasthan", city: "Jaipur", postalCode: "302018", ...over });
const V = (over, mode = "create") => validateAddress({ ...base(over), ...(mode === "update" ? { version: 1 } : {}) }, mode);

let r = V({});
check("A-01 a valid business + billing address passes; optional fields become null", r.ok && r.value.contactPerson === null && r.value.phone === null && r.value.addressLine2 === null && r.value.purposes.join() === "BUSINESS,BILLING" && r.value.postalCode === "302018");
check("A-02 label: required, 2 to 60 characters, no markup", ["", "A", "x".repeat(61), "<b>"].every((label) => V({ label }).fields?.label));
check("A-03 purposes: at least one, only known values, a duplicate collapses to one, an unknown value among valid ones is refused", V({ purposes: [] }).fields?.purposes && V({ purposes: ["NOPE"] }).fields?.purposes && V({ purposes: "BILLING" }).fields?.purposes && V({ purposes: ["BILLING", "NOPE"] }).fields?.purposes && V({ purposes: ["BILLING", "BILLING"] }).value?.purposes.length === 1);
check("A-04 all eight purposes are valid", ADDRESS_PURPOSES.length === 8 && ADDRESS_PURPOSES.every((p) => V({ purposes: [p.value], contactPerson: "Asha Verma", phone: { countryCode: "+91", number: "9876543210" } }).ok));
check("A-05 delivery and goods-receiving addresses need a contact person and a phone number; others do not", V({ purposes: ["DELIVERY"] }).fields?.contactPerson && V({ purposes: ["DELIVERY"] }).fields?.phone && V({ purposes: ["GOODS_RECEIVING"] }).fields?.phone && V({ purposes: ["WAREHOUSE"] }).ok && V({ purposes: ["DELIVERY"], contactPerson: "Asha Verma", phone: { countryCode: "+91", number: "98765 43210" } }).value?.phone?.normalized === "+91 9876543210");
check("A-06 contact person: letters only, max 100; phone: valid for its country code", V({ contactPerson: "<x>" }).fields?.contactPerson && V({ contactPerson: "12345" }).fields?.contactPerson && V({ phone: { countryCode: "+91", number: "12" } }).fields?.phone && V({ phone: { countryCode: "+999", number: "9876543210" } }).fields?.phone && V({ phone: { countryCode: "+44", number: "7911 123456" } }).value?.phone?.normalized === "+44 7911123456");
check("A-07 company name optional, 2 to 150, no markup", V({ companyName: "A" }).fields?.companyName && V({ companyName: "x".repeat(151) }).fields?.companyName && V({ companyName: "Verma Traders" }).value?.companyName === "Verma Traders");
check("A-08 address line 1 required (3 to 150); line 2 and landmark optional and bounded", V({ addressLine1: "" }).fields?.addressLine1 && V({ addressLine1: "ab" }).fields?.addressLine1 && V({ addressLine1: "x".repeat(151) }).fields?.addressLine1 && V({ addressLine2: "x".repeat(151) }).fields?.addressLine2 && V({ landmark: "x".repeat(101) }).fields?.landmark);
check("A-09 country must be a supported one; state and city required", V({ country: "Atlantis" }).fields?.country && V({ state: "" }).fields?.state && V({ city: "" }).fields?.city && V({ city: "x".repeat(81) }).fields?.city);
check("A-10 India: PIN required, six digits, not starting with 0", V({ postalCode: "" }).fields?.postalCode && V({ postalCode: "012345" }).fields?.postalCode && V({ postalCode: "30201" }).fields?.postalCode && V({ postalCode: "ABCDEF" }).fields?.postalCode);
check("A-11 other countries use their own postal code rule, not the Indian one", V({ country: "United Kingdom", state: "England", city: "London", postalCode: "SW1A 1AA" }).ok && V({ country: "United States", state: "NY", city: "New York", postalCode: "10001" }).ok && V({ country: "Singapore", state: "Singapore", city: "Singapore", postalCode: "018956" }).ok && V({ country: "United Kingdom", postalCode: "" }).fields?.postalCode);
check("A-12 a default needs its purpose: default billing without Billing, default delivery without Delivery are refused", V({ purposes: ["BUSINESS"], isDefaultBilling: true }).fields?.isDefaultBilling && V({ purposes: ["BILLING"], isDefaultDelivery: true }).fields?.isDefaultDelivery && V({ purposes: ["BILLING"], isDefaultBilling: true }).ok);
check("A-13 the two defaults are independent flags; absent means unchanged (undefined), non-boolean refused", V({}).value?.isDefaultBilling === undefined && V({ purposes: ["BILLING", "DELIVERY"], contactPerson: "Asha Verma", phone: { countryCode: "+91", number: "9876543210" }, isDefaultBilling: true, isDefaultDelivery: false }).value?.isDefaultDelivery === false && V({ isDefaultBilling: "true" }).fields?.isDefaultBilling);
check("A-14 server-only fields are refused (buyer id, company id, owner, timestamps, normalised phone, deleted, role, verification...)", ["buyerId", "companyId", "ownerUserId", "createdAt", "updatedAt", "deletedAt", "normalizedPhone", "role", "verificationStatus", "isAdmin", "_id", "id"].every((k) => V({ [k]: "x" }).fields?.[k]));
check("A-15 an update must carry the version it loaded", validateAddress(base(), "update").ok === false && validateAddress({ ...base(), version: 0 }, "update").ok === false && V({}, "update").value?.version === 1);
check("A-16 non-object bodies and operator objects are refused without throwing", [null, undefined, "x", 5, [], true].every((v) => validateAddress(v, "create").ok === false) && V({ label: { $ne: "" } }).fields?.label && V({ city: { $gt: "" } }).fields?.city);
check("A-17 whitespace is collapsed and trimmed; control characters removed", V({ label: "  Head   Office  ", city: "Jai\u0000pur" }).value?.label === "Head Office" && V({ city: "Jai\u0000pur" }).value?.city === "Jai pur");

check("Q-01 list query defaults: type all, no text, page 1, limit 50", JSON.stringify(parseAddressQuery({}).value) === JSON.stringify({ type: "all", q: "", page: 1, limit: MAX_ADDRESSES }));
check("Q-02 the four filter values are accepted; anything else refused", ["all", "delivery", "billing", "business"].every((type) => parseAddressQuery({ type }).ok) && ["warehouse", "ALL", "1", "{}", ["x"]].every((type) => !parseAddressQuery({ type }).ok));
check("Q-03 search text is trimmed and collapsed; over 60 characters refused", parseAddressQuery({ q: "  jaipur   road " }).value?.q === "jaipur road" && !parseAddressQuery({ q: "x".repeat(61) }).ok && parseAddressQuery({ q: "x".repeat(60) }).ok);
check("Q-04 page and limit are whole numbers within bounds", !parseAddressQuery({ page: 0 }).ok && !parseAddressQuery({ page: "x" }).ok && !parseAddressQuery({ limit: 0 }).ok && !parseAddressQuery({ limit: 51 }).ok && !parseAddressQuery({ limit: 1.5 }).ok && parseAddressQuery({ page: "2", limit: "20" }).value?.limit === 20);

const saved = { label: "Head Office", contactPerson: "Asha", companyName: "Verma", phone: { normalized: "+91 9876543210" }, addressLine1: "A-102", addressLine2: null, landmark: null, city: "Jaipur", state: "Rajasthan", postalCode: "302018", country: "India", id: "abc", buyerId: "x", version: 3 };
const snap = toAddressSnapshot(saved);
saved.city = "Changed Later";
check("S-01 an order snapshot is a plain copy with no id, buyer id or version", snap.city === "Jaipur" && !("id" in snap) && !("buyerId" in snap) && !("version" in snap) && snap.phone === "+91 9876543210");
check("S-02 editing the saved address afterwards does not change the snapshot", snap.city === "Jaipur" && JSON.stringify(snap).includes("Jaipur") && !JSON.stringify(snap).includes("Changed Later"));
check("S-03 the inquiry location text is 'City, State PIN'", locationText({ city: "Jaipur", state: "Rajasthan", postalCode: "302018" }) === "Jaipur, Rajasthan 302018");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
