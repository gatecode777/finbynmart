import { checkEmail, checkPhone, PHONE_COUNTRIES } from "@/lib/inquiries/rules";
import { CONSENT_VERSION } from "@/lib/legal";

/**
 * Buyer registration rules, shared by the sign-up form (instant feedback) and the server (authoritative). Pure.
 *
 * Policy (also in the page spec):
 *  - Password: 10 to 128 characters, not blank, not on a short list of the most common passwords. Nothing is truncated and
 *    there are no character-class rules (length and rarity matter more than symbols). The strength meter is guidance only.
 *  - Email is the account identity: trimmed and lower-cased, one account per address (a unique index backs it).
 *  - Mobile number: the chosen country code plus the national number, stored as "+91 9876543210". It is NOT unique: a company
 *    may share one number across staff, and since the number is not verified, uniqueness would only let one person block
 *    another's number.
 *  - Company: required. It is stored on the account as "unverified"; no company record is created or claimed.
 *  - Consent must be explicitly true and carries the version of the wording the person saw.
 *  - The role, status and verification flags are decided by the server. A request that tries to send them is refused.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 100;
export const COMPANY_MAX = 150;

/** A request carrying any of these is refused: they can only be set by the server. */
export const FORBIDDEN_FIELDS = ["role", "accountStatus", "status", "emailVerified", "phoneVerified", "companyId", "passwordHash", "permissions", "isAdmin", "admin", "userId", "_id", "verified"] as const;

const COMMON_PASSWORDS = new Set([
  "password12", "password123", "password1234", "passw0rd123", "1234567890", "12345678910", "0123456789", "qwertyuiop", "qwerty12345", "qwerty123456",
  "iloveyou123", "welcome123", "welcome1234", "admin12345", "administrator", "letmein1234", "abcdefghij", "abcd123456", "1q2w3e4r5t", "changeme123",
  "finbynmart", "finbynmart1", "finbynmart123", "password!23", "pass1234567", "123456789a", "a123456789", "11111111111", "00000000000",
]);

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");

export const normalizeEmail = (value: string): string => value.normalize("NFKC").trim().toLowerCase();

export function checkFullName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const name = clean(raw, NAME_MAX);
  if (name.length < 2) return { ok: false, error: "Enter your full name (at least 2 characters)." };
  if (name.length > NAME_MAX) return { ok: false, error: `Keep your name within ${NAME_MAX} characters.` };
  // Any script is fine; it needs at least one letter and no markup characters.
  if (!/\p{L}/u.test(name) || /[<>]/.test(name)) return { ok: false, error: "Use letters in your name, without symbols such as < or >." };
  return { ok: true, value: name };
}

export function checkCompanyName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const company = clean(raw, COMPANY_MAX);
  if (company.length < 2) return { ok: false, error: "Enter your company name (at least 2 characters)." };
  if (company.length > COMPANY_MAX) return { ok: false, error: `Keep the company name within ${COMPANY_MAX} characters.` };
  if (/[<>]/.test(company)) return { ok: false, error: "Remove symbols such as < or > from the company name." };
  return { ok: true, value: company };
}

/**
 * The password rules as data, so the live checklist on the reset page shows exactly what the server enforces
 * (checkBuyerPassword below applies the same limits). Nothing here trims, normalises or truncates the password.
 */
export const PASSWORD_RULES: { id: string; label: string; test: (password: string) => boolean }[] = [
  { id: "min", label: `At least ${PASSWORD_MIN} characters`, test: (p) => p.length >= PASSWORD_MIN },
  { id: "max", label: `No more than ${PASSWORD_MAX} characters`, test: (p) => p.length > 0 && p.length <= PASSWORD_MAX },
  { id: "blank", label: "Not only spaces", test: (p) => p.trim().length > 0 },
  { id: "common", label: "Not a commonly used password", test: (p) => p.length > 0 && !COMMON_PASSWORDS.has(p.toLowerCase()) && !/^(.)\1+$/.test(p) },
];

/** The first problem with a password, or undefined. The password is never trimmed or changed. */
export function checkBuyerPassword(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length === 0) return "Create a password.";
  if (raw.trim().length === 0) return "A password cannot be only spaces.";
  if (raw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (raw.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  if (COMMON_PASSWORDS.has(raw.toLowerCase())) return "That password is too common. Choose a less predictable one.";
  if (/^(.)\1+$/.test(raw)) return "Use more than one repeated character.";
  return undefined;
}

export interface PasswordStrength {
  /** 0 (too weak) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong";
}

/** Guidance for the meter: length first, then variety. The hard rules are checkBuyerPassword; this only advises. */
export function passwordStrength(password: string): PasswordStrength {
  if (checkBuyerPassword(password)) return { score: password.length >= 6 ? 1 : 0, label: password.length >= 6 ? "Weak" : "Too weak" };
  let points = 1; // meets the minimum
  if (password.length >= 14) points += 1;
  if (password.length >= 20) points += 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/].filter((re) => re.test(password)).length;
  if (classes >= 3) points += 1;
  const score = Math.min(4, Math.max(1, points)) as 1 | 2 | 3 | 4;
  return { score, label: (["Too weak", "Weak", "Fair", "Good", "Strong"] as const)[score] };
}

export interface BuyerRegistration {
  name: string;
  email: string;
  phone: { countryCode: string; number: string; normalized: string };
  companyName: string;
  password: string;
  consentPolicyVersion: string;
}

export type BuyerRegistrationResult = { ok: true; value: BuyerRegistration } | { ok: false; fields: Record<string, string> };

/**
 * Validates every field and reports all problems together. `raw.phone` is { countryCode, number } (the form's two inputs).
 * A policy version other than the current one means the form on screen is out of date (reported on `consent`).
 */
export function validateBuyerRegistration(raw: unknown): BuyerRegistrationResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};

  const forbidden = FORBIDDEN_FIELDS.filter((key) => key in body);
  for (const key of forbidden) fields[key] = "This value is set by the server and cannot be sent.";

  const name = checkFullName(body.name);
  if (!name.ok) fields.name = name.error;

  const email = checkEmail(body.email);
  if (!email.ok) fields.email = email.error;

  const phoneRaw = body.phone && typeof body.phone === "object" && !Array.isArray(body.phone) ? (body.phone as Record<string, unknown>) : {};
  const phone = checkPhone(phoneRaw.number, phoneRaw.countryCode);
  if (!phone.ok) fields.phone = phone.error;

  const company = checkCompanyName(body.companyName);
  if (!company.ok) fields.companyName = company.error;

  const passwordProblem = checkBuyerPassword(body.password);
  if (passwordProblem) fields.password = passwordProblem;

  if (typeof body.confirmPassword !== "string" || body.confirmPassword.length === 0) fields.confirmPassword = "Re-enter your password.";
  else if (body.confirmPassword !== body.password) fields.confirmPassword = "The two passwords do not match.";

  if (body.consent !== true) fields.consent = "Tick the box to agree before creating your account.";
  else if (body.consentPolicyVersion !== CONSENT_VERSION) fields.consent = "This sign-up form is out of date. Reload the page and try again.";

  if (Object.keys(fields).length > 0 || !name.ok || !email.ok || !phone.ok || !company.ok) return { ok: false, fields };
  const [countryCode, ...rest] = phone.value.split(" ");
  return {
    ok: true,
    value: { name: name.value, email: normalizeEmail(email.value), phone: { countryCode, number: rest.join(" "), normalized: phone.value }, companyName: company.value, password: body.password as string, consentPolicyVersion: CONSENT_VERSION },
  };
}

export { PHONE_COUNTRIES };
