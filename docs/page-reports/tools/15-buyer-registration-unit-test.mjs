// Unit tests for the Page 15 rules (src/lib/auth/buyerRegistration.ts) and the Contact Us rules (src/lib/support/rules.ts).
// Run: node --import ./docs/page-reports/tools/alias-register.mjs docs/page-reports/tools/15-buyer-registration-unit-test.mjs
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const reg = await load("src/lib/auth/buyerRegistration.ts");
const support = await load("src/lib/support/rules.ts");
const { CONSENT_VERSION } = await load("src/lib/legal.ts");

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failures.push(`${name} ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const valid = () => ({
  name: "Asha Verma",
  email: "  Asha.Verma@Example.COM ",
  phone: { countryCode: "+91", number: "98765 43210" },
  companyName: "Verma Traders",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
  consent: true,
  consentPolicyVersion: CONSENT_VERSION,
});

// ---- a valid registration
let r = reg.validateBuyerRegistration(valid());
check("R-01 valid registration passes", r.ok);
check("R-02 email is trimmed and lower-cased", r.ok && r.value.email === "asha.verma@example.com", r.ok ? r.value.email : "");
check("R-03 phone is normalised with its country code", r.ok && r.value.phone.normalized === "+91 9876543210" && r.value.phone.countryCode === "+91", r.ok ? JSON.stringify(r.value.phone) : "");
check("R-04 consent policy version is recorded", r.ok && r.value.consentPolicyVersion === CONSENT_VERSION);
check("R-05 password is returned untouched (not trimmed)", reg.validateBuyerRegistration({ ...valid(), password: "  spaced out pass  ", confirmPassword: "  spaced out pass  " }).value?.password === "  spaced out pass  ");

// ---- each field
const bad = (patch) => reg.validateBuyerRegistration({ ...valid(), ...patch });
check("R-06 empty name rejected", bad({ name: "" }).fields?.name);
check("R-07 one-letter name rejected", bad({ name: "A" }).fields?.name);
check("R-08 name with markup rejected", bad({ name: "<b>Asha</b>" }).fields?.name);
check("R-09 name of digits only rejected", bad({ name: "12345" }).fields?.name);
check("R-10 non-Latin name accepted", bad({ name: "आशा वर्मा" }).ok === true);
check("R-11 101-character name rejected", bad({ name: "a".repeat(101) }).fields?.name);
check("R-12 bad email rejected", bad({ email: "not-an-email" }).fields?.email);
check("R-13 email with a comma rejected", bad({ email: "a,b@example.com" }).fields?.email);
check("R-14 unknown country code rejected", bad({ phone: { countryCode: "+999", number: "9876543210" } }).fields?.phone);
check("R-15 short phone rejected", bad({ phone: { countryCode: "+91", number: "98765" } }).fields?.phone);
check("R-16 Indian number starting with 5 rejected", bad({ phone: { countryCode: "+91", number: "5876543210" } }).fields?.phone);
check("R-17 phone with letters rejected", bad({ phone: { countryCode: "+91", number: "98765abcde" } }).fields?.phone);
check("R-18 missing phone object rejected", bad({ phone: undefined }).fields?.phone);
check("R-19 empty company rejected", bad({ companyName: "" }).fields?.companyName);
check("R-20 company with markup rejected", bad({ companyName: "Acme <script>" }).fields?.companyName);
check("R-21 151-character company rejected", bad({ companyName: "c".repeat(151) }).fields?.companyName);

// ---- password policy
check("R-22 9-character password rejected", bad({ password: "abcdefghi", confirmPassword: "abcdefghi" }).fields?.password);
check("R-23 10-character password accepted", bad({ password: "abcdefghi1", confirmPassword: "abcdefghi1" }).ok === true);
check("R-24 129-character password rejected", bad({ password: "a1".repeat(65), confirmPassword: "a1".repeat(65) }).fields?.password);
check("R-25 128-character password accepted", bad({ password: "xY".repeat(64), confirmPassword: "xY".repeat(64) }).ok === true);
check("R-26 whitespace-only password rejected", bad({ password: " ".repeat(12), confirmPassword: " ".repeat(12) }).fields?.password);
check("R-27 common password rejected (case-insensitive)", bad({ password: "Password123", confirmPassword: "Password123" }).fields?.password);
check("R-28 repeated single character rejected", bad({ password: "aaaaaaaaaaaa", confirmPassword: "aaaaaaaaaaaa" }).fields?.password);
check("R-29 mismatched confirmation rejected", bad({ confirmPassword: "something else entirely" }).fields?.confirmPassword);
check("R-30 missing confirmation rejected", bad({ confirmPassword: "" }).fields?.confirmPassword);
check("R-31 non-string password rejected", bad({ password: 12345678901, confirmPassword: 12345678901 }).fields?.password);
check("R-32 emoji / unicode password accepted", bad({ password: "pässwörd-🔑-long", confirmPassword: "pässwörd-🔑-long" }).ok === true);

// ---- consent
check("R-33 missing consent rejected", bad({ consent: undefined }).fields?.consent);
check("R-34 consent false rejected", bad({ consent: false }).fields?.consent);
check('R-35 consent "true" (string) rejected', bad({ consent: "true" }).fields?.consent);
check("R-36 consent 1 rejected", bad({ consent: 1 }).fields?.consent);
check("R-37 stale policy version rejected", bad({ consentPolicyVersion: "1999-01-01" }).fields?.consent);

// ---- mass assignment: server-only fields can never be sent
for (const key of reg.FORBIDDEN_FIELDS) check(`R-38 "${key}" in the request is refused`, bad({ [key]: key === "role" ? "admin" : true }).fields?.[key]);

// ---- all problems are reported together
r = reg.validateBuyerRegistration({});
check("R-39 an empty body reports every required field", ["name", "email", "phone", "companyName", "password", "confirmPassword", "consent"].every((k) => r.fields?.[k]), JSON.stringify(Object.keys(r.fields ?? {})));
check("R-40 non-object bodies are rejected without throwing", [null, undefined, "x", 5, [], true].every((v) => reg.validateBuyerRegistration(v).ok === false));

// ---- strength meter is guidance only and monotonic with length
const s = reg.passwordStrength;
check("R-41 empty password scores 0", s("").score === 0);
check("R-42 password below the minimum cannot score above 1", s("Ab1!xyz").score <= 1);
check("R-43 a long passphrase scores 3 or more", s("correct horse battery staple").score >= 3, String(s("correct horse battery staple").score));
check("R-44 a common password scores low", s("password123").score <= 1);
check("R-45 label matches score", ["Too weak", "Weak", "Fair", "Good", "Strong"][s("correct horse battery staple").score] === s("correct horse battery staple").label);

// ---- Contact Us rules
const supportBody = () => ({ name: "Asha Verma", email: "asha@example.com", phone: { countryCode: "+91", number: "" }, topic: "BUYER_HELP", message: "I cannot find where to download my invoice.", consent: true, consentPolicyVersion: CONSENT_VERSION, idempotencyKey: "abcdef0123456789abcdef" });
const sup = (patch) => support.validateSupportRequest({ ...supportBody(), ...patch });
check("S-01 valid message passes", sup({}).ok);
check("S-02 empty optional phone is accepted and omitted", sup({}).value?.phone === undefined);
check("S-03 a given phone is validated", sup({ phone: { countryCode: "+91", number: "123" } }).fields?.phone);
check("S-04 a valid phone is normalised", sup({ phone: { countryCode: "+44", number: "7911 123456" } }).value?.phone === "+44 7911123456");
check("S-05 unknown topic rejected", sup({ topic: "HACK" }).fields?.topic);
check("S-06 missing topic rejected", sup({ topic: "" }).fields?.topic);
check("S-07 short message rejected", sup({ message: "help" }).fields?.message);
check("S-08 message asks how we can help (not 'requirement')", !/requirement/i.test(sup({ message: "help" }).fields?.message ?? ""), sup({ message: "help" }).fields?.message);
check("S-09 2001-character message rejected", sup({ message: "x".repeat(2001) }).fields?.message);
check("S-10 missing consent rejected", sup({ consent: false }).fields?.consent);
check("S-11 bad email rejected", sup({ email: "nope" }).fields?.email);
check("S-12 bad idempotency key rejected", sup({ idempotencyKey: "short" }).fields?.idempotencyKey);
check("S-13 idempotency key is optional", support.validateSupportRequest({ ...supportBody(), idempotencyKey: undefined }).ok);
check("S-14 reference pattern accepts FBM-SUP-XXXXXXXX only", support.SUPPORT_REFERENCE_PATTERN.test("FBM-SUP-7K3M9QZ2") && !support.SUPPORT_REFERENCE_PATTERN.test("FBM-INQ-7K3M9QZ2") && !support.SUPPORT_REFERENCE_PATTERN.test("FBM-SUP-7K3M9QZI"));
check("S-15 extra body fields are ignored, never copied", !("status" in (sup({ status: "CLOSED", userId: "x" }).value ?? {})));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n" + failures.join("\n"));
  process.exit(1);
}
