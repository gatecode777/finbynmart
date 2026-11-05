/**
 * Inquiry rules shared by the Contact Supplier form (instant feedback) and the server (authoritative). Pure: no
 * imports, so the browser, the API and the node-run unit tests all use the same code.
 *
 * Policy (also in the page spec):
 *  - Four inquiry types. A product inquiry needs a product of this supplier. Get Best Quote may be sent to the supplier
 *    in general (the existing quote form already allowed that). A general inquiry or a bulk requirement needs none.
 *  - Quantity is a whole number; it is never rounded, converted or changed for the buyer.
 *  - A registered buyer is identified by the session only. A guest gives name, phone and email; nothing about their
 *    contact details is "verified" (there is no verification step), so none of it is ever described that way.
 *  - Consent must be given explicitly and is stored with the time and the policy version (null while no versioned
 *    policy exists). The consent box is never pre-ticked.
 */

export const INQUIRY_TYPES = [
  { value: "GET_BEST_QUOTE", label: "Get Best Quote", needsProduct: false },
  { value: "PRODUCT_INQUIRY", label: "Product Inquiry", needsProduct: true },
  { value: "GENERAL_INQUIRY", label: "General Inquiry", needsProduct: false },
  { value: "BULK_REQUIREMENT", label: "Bulk Requirement", needsProduct: false },
] as const;

export type InquiryType = (typeof INQUIRY_TYPES)[number]["value"];

export const INQUIRY_LIMITS = { messageMin: 10, messageMax: 2000, nameMin: 2, nameMax: 80, companyMax: 100, locationMax: 100, emailMax: 254 } as const;

/** Units a buyer can choose for a general inquiry; a product fixes its own unit. Matched with the catalogue's unit aliases. */
export const INQUIRY_UNITS = [
  { label: "Piece", key: "piece" },
  { label: "Kilogram", key: "kg" },
  { label: "Ton", key: "ton" },
  { label: "Meter", key: "meter" },
  { label: "Box", key: "box" },
  { label: "Set", key: "set" },
  { label: "Litre", key: "liter" },
  { label: "Roll", key: "roll" },
  { label: "Pair", key: "pair" },
  { label: "Bag", key: "bag" },
  { label: "Unit", key: "unit" },
] as const;

/** Calling codes offered to guests, with the number of digits a national number has. */
export const PHONE_COUNTRIES = [
  { code: "+91", label: "India (+91)", digits: 10 },
  { code: "+971", label: "UAE (+971)", digits: 9 },
  { code: "+1", label: "USA / Canada (+1)", digits: 10 },
  { code: "+44", label: "United Kingdom (+44)", digits: 10 },
  { code: "+65", label: "Singapore (+65)", digits: 8 },
  { code: "+86", label: "China (+86)", digits: 11 },
] as const;

// ---------- status lifecycle ----------

export type InquiryStatus = "NEW" | "NOTIFIED" | "IN_PROGRESS" | "REPLIED" | "QUOTED" | "CLOSED" | "CANCELLED" | "REJECTED";

/** Who may move an inquiry where is decided by the route (the buyer can only cancel); this says what is possible at all. */
const TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  NEW: ["NOTIFIED", "IN_PROGRESS", "REJECTED", "CANCELLED"],
  NOTIFIED: ["IN_PROGRESS", "REPLIED", "REJECTED", "CANCELLED"],
  IN_PROGRESS: ["REPLIED", "QUOTED", "REJECTED", "CANCELLED", "CLOSED"],
  REPLIED: ["QUOTED", "IN_PROGRESS", "CLOSED"],
  QUOTED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const BUYER_CANCELLABLE: InquiryStatus[] = ["NEW", "NOTIFIED", "IN_PROGRESS"];

export const canTransition = (from: InquiryStatus, to: InquiryStatus): boolean => TRANSITIONS[from]?.includes(to) ?? false;

/** Records written before the lifecycle existed say "new". */
export const normaliseStatus = (stored: string | undefined): InquiryStatus => {
  const upper = (stored ?? "NEW").toUpperCase();
  return upper in TRANSITIONS ? (upper as InquiryStatus) : "NEW";
};

// ---------- field rules ----------

export interface Located {
  text: string;
  postalCode?: string;
}

const line = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");
const multiline = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";

export const normaliseInquiryType = (value: unknown): InquiryType | null => INQUIRY_TYPES.find((type) => type.value === value)?.value ?? null;

export const inquiryTypeNeedsProduct = (type: InquiryType): boolean => INQUIRY_TYPES.find((item) => item.value === type)?.needsProduct ?? false;

/** The canonical unit label for what the buyer chose ("Pieces" -> "Piece"), or null when it is not an offered unit. */
export function canonicalUnit(raw: unknown, keyOf: (unit: string) => string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = keyOf(raw);
  return INQUIRY_UNITS.find((unit) => unit.key === key)?.label ?? null;
}

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkMessage(raw: unknown): Check<string> {
  const text = multiline(raw);
  if (text.length < INQUIRY_LIMITS.messageMin) return { ok: false, error: `Describe your requirement in at least ${INQUIRY_LIMITS.messageMin} characters.` };
  if (text.length > INQUIRY_LIMITS.messageMax) return { ok: false, error: `Keep the message within ${INQUIRY_LIMITS.messageMax.toLocaleString("en-IN")} characters.` };
  return { ok: true, value: text };
}

/** Optional. Letters, digits and ordinary punctuation; a six-digit PIN code inside it is kept separately. */
export function checkLocation(raw: unknown): Check<Located | undefined> {
  const text = line(raw, INQUIRY_LIMITS.locationMax);
  if (!text) return { ok: true, value: undefined };
  if (text.length > INQUIRY_LIMITS.locationMax) return { ok: false, error: `Keep the location within ${INQUIRY_LIMITS.locationMax} characters.` };
  if (!/^[\p{L}\p{M}\p{N} ,.\-()/&']+$/u.test(text)) return { ok: false, error: "Use letters, numbers and ordinary punctuation only (city, state or PIN code)." };
  const digits = text.match(/\d+/g) ?? [];
  const pin = digits.find((group) => group.length === 6);
  if (digits.some((group) => group.length >= 5 && group.length !== 6) || (pin && !/^[1-9]\d{5}$/.test(pin))) return { ok: false, error: "A PIN code has six digits and does not start with 0." };
  return { ok: true, value: { text, ...(pin ? { postalCode: pin } : {}) } };
}

export interface GuestContact {
  name: string;
  email: string;
  /** Calling code and national number, e.g. "+91 9876543210". */
  phone: string;
  companyName?: string;
}

export function checkName(raw: unknown): Check<string> {
  const name = line(raw, INQUIRY_LIMITS.nameMax);
  if (name.length < INQUIRY_LIMITS.nameMin || name.length > INQUIRY_LIMITS.nameMax) return { ok: false, error: `Enter your full name (${INQUIRY_LIMITS.nameMin} to ${INQUIRY_LIMITS.nameMax} characters).` };
  if (!/^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(name)) return { ok: false, error: "Use letters, spaces and . ' - only in your name." };
  return { ok: true, value: name };
}

export function checkEmail(raw: unknown): Check<string> {
  const email = line(raw, INQUIRY_LIMITS.emailMax).toLowerCase();
  if (!email || email.length > INQUIRY_LIMITS.emailMax || !/^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/.test(email) || email.includes("..") || email.startsWith(".") || email.split("@")[0].endsWith(".")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, value: email };
}

/** `dialCode` is one of PHONE_COUNTRIES; the number may carry spaces, dashes or brackets but no other characters. */
export function checkPhone(rawNumber: unknown, rawDialCode: unknown): Check<string> {
  const country = PHONE_COUNTRIES.find((item) => item.code === rawDialCode);
  if (!country) return { ok: false, error: "Choose the country code of your phone number." };
  const text = typeof rawNumber === "string" ? rawNumber.trim() : "";
  if (!/^[\d\s\-()]+$/.test(text)) return { ok: false, error: `Enter your ${country.digits}-digit mobile number.` };
  const digits = text.replace(/\D/g, "");
  if (digits.length !== country.digits) return { ok: false, error: `A phone number for ${country.label} has ${country.digits} digits.` };
  if (country.code === "+91" && !/^[6-9]/.test(digits)) return { ok: false, error: "An Indian mobile number starts with 6, 7, 8 or 9." };
  if (/^(\d)\1+$/.test(digits)) return { ok: false, error: "Enter a real phone number." };
  return { ok: true, value: `${country.code} ${digits}` };
}

export function checkCompany(raw: unknown): Check<string | undefined> {
  const company = line(raw, INQUIRY_LIMITS.companyMax);
  if (!company) return { ok: true, value: undefined };
  if (company.length > INQUIRY_LIMITS.companyMax) return { ok: false, error: `Keep the company name within ${INQUIRY_LIMITS.companyMax} characters.` };
  return { ok: true, value: company };
}

/** Only an explicit `true` counts: "true", 1 and "on" do not. */
export const hasConsent = (raw: unknown): boolean => raw === true;

/** A key the form makes once per page load so that a retry of the same submission is recognised. */
export const isIdempotencyKey = (raw: unknown): raw is string => typeof raw === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(raw);

export const REFERENCE_PATTERN = /^FBM-INQ-[0-9A-HJKMNP-TV-Z]{8}$/;

/** Where a buyer returns to after signing in: a path on this site only, never another address. */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  if (!/^\/(?!\/)[A-Za-z0-9\-._~/%?=&]*$/.test(raw)) return null;
  return raw.startsWith("/sign-in") || raw.startsWith("/sign-up") || raw.startsWith("/api/") ? null : raw;
}
