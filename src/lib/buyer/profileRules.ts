import { checkEmail, checkPhone } from "@/lib/inquiries/rules";
import { checkCompanyName, checkFullName, normalizeEmail } from "@/lib/auth/buyerRegistration";

/**
 * Buyer profile and company rules shared by the forms (instant feedback) and the server (authoritative). Pure.
 *
 * What a buyer may change is an explicit allowlist. Everything else (role, status, verification flags, ids, the password hash,
 * the primary email and mobile number, the company's verification state) can only be changed by the server, and a request that
 * names one is refused. The primary email and mobile number change only through a re-verification workflow, which needs an
 * email provider and an SMS provider that this project does not have yet, so they are read-only here.
 */

export const COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "SG", name: "Singapore" },
  { code: "CN", name: "China" },
] as const;

export const BUSINESS_TYPES = ["Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Other"] as const;

/** Documents a company can submit. None is required of every business: the list is what is accepted. */
export const DOCUMENT_TYPES = [
  { value: "GST_CERTIFICATE", label: "GST Registration Certificate" },
  { value: "PAN_DOCUMENT", label: "PAN Document" },
  { value: "INCORPORATION_CERTIFICATE", label: "Certificate of Incorporation" },
  { value: "BUSINESS_REGISTRATION", label: "Business Registration" },
  { value: "ADDRESS_PROOF", label: "Address Proof" },
  { value: "OTHER", label: "Other Business Document" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];
export type DocumentStatus = "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "RESUBMISSION_REQUIRED";

export const DOCUMENT_LIMITS = { maxBytes: 5 * 1024 * 1024, extensions: ["pdf", "jpg", "jpeg", "png"] as const, expiryYearsAhead: 30 };

/** A request carrying any of these is refused: only the server sets them. */
export const FORBIDDEN_PROFILE_FIELDS = ["_id", "id", "role", "accountStatus", "status", "emailVerified", "phoneVerified", "passwordHash", "permissions", "isAdmin", "admin", "sessionVersion", "companyId", "createdAt", "consent", "lastLoginAt", "verificationStatus", "verified", "buyerId", "userId"] as const;
const READ_ONLY_CONTACT = ["email", "phone"] as const;

const line = (value: unknown, max: number) => (typeof value === "string" ? value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");
const multi = (value: unknown, max: number) => (typeof value === "string" ? value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max + 1) : "");

type Fields = Record<string, string>;

function refuseForbidden(body: Record<string, unknown>, fields: Fields) {
  for (const key of FORBIDDEN_PROFILE_FIELDS) if (key in body) fields[key] = "This value is set by the server and cannot be sent.";
  for (const key of READ_ONLY_CONTACT) if (key in body) fields[key] = "Your primary email and mobile number change only through a verification process, which is not available yet.";
}

export interface PersonalInput {
  name: string;
  designation: string | null;
  alternatePhone: { countryCode: string; number: string; normalized: string } | null;
  alternateEmail: string | null;
  version: number;
}

export type PersonalResult = { ok: true; value: PersonalInput } | { ok: false; fields: Fields };

/** Validates a profile update. `primaryEmail` is passed so the alternate address cannot just repeat it. */
export function validatePersonalUpdate(raw: unknown, primaryEmail: string): PersonalResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Fields = {};
  refuseForbidden(body, fields);

  const name = checkFullName(body.name);
  if (!name.ok) fields.name = name.error;

  const designation = line(body.designation, 100);
  if (designation.length > 100) fields.designation = "Keep the designation within 100 characters.";
  else if (/[<>]/.test(designation)) fields.designation = "Remove symbols such as < or > from the designation.";

  let alternatePhone: PersonalInput["alternatePhone"] = null;
  const phoneRaw = body.alternatePhone && typeof body.alternatePhone === "object" && !Array.isArray(body.alternatePhone) ? (body.alternatePhone as Record<string, unknown>) : {};
  if (typeof phoneRaw.number === "string" && phoneRaw.number.trim() !== "") {
    const phone = checkPhone(phoneRaw.number, phoneRaw.countryCode);
    if (!phone.ok) fields.alternatePhone = phone.error;
    else {
      const [countryCode, ...rest] = phone.value.split(" ");
      alternatePhone = { countryCode, number: rest.join(" "), normalized: phone.value };
    }
  }

  let alternateEmail: string | null = null;
  if (typeof body.alternateEmail === "string" && body.alternateEmail.trim() !== "") {
    const email = checkEmail(body.alternateEmail);
    if (!email.ok) fields.alternateEmail = email.error;
    else if (normalizeEmail(email.value) === normalizeEmail(primaryEmail)) fields.alternateEmail = "The alternate email must be different from your primary email.";
    else alternateEmail = normalizeEmail(email.value);
  }

  const version = body.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) fields.version = "Reload the page and try again.";

  if (Object.keys(fields).length > 0 || !name.ok) return { ok: false, fields };
  return { ok: true, value: { name: name.value, designation: designation || null, alternatePhone, alternateEmail, version: version as number } };
}

// ---------- company ----------

export interface CompanyInput {
  legalName: string;
  displayName: string | null;
  businessType: (typeof BUSINESS_TYPES)[number];
  industry: string | null;
  description: string | null;
  website: string | null;
  yearEstablished: number | null;
  companyEmail: string | null;
  country: string;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  registeredAddress: string | null;
  operatingAddress: string | null;
}

export type CompanyResult = { ok: true; value: CompanyInput; version?: number } | { ok: false; fields: Fields };

/** India: six digits not starting with 0. Other countries: a general 3 to 12 character postal code (no Indian rule is applied). */
export function checkPostalCode(raw: unknown, country: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const code = line(raw, 12).toUpperCase();
  if (!code) return { ok: true, value: null };
  if (country === "India") return /^[1-9]\d{5}$/.test(code) ? { ok: true, value: code } : { ok: false, error: "A PIN code has six digits and does not start with 0." };
  return /^[A-Z0-9][A-Z0-9 -]{1,10}[A-Z0-9]$/.test(code) ? { ok: true, value: code } : { ok: false, error: "Enter a valid postal code." };
}

function checkWebsite(raw: unknown): { value: string | null; error?: string } {
  const text = line(raw, 200);
  if (!text) return { value: null };
  if (text.length > 200) return { value: null, error: "Keep the website within 200 characters." };
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || /\s/.test(url.hostname)) return { value: null, error: "Enter a valid website address, for example www.example.com." };
    return { value: url.toString().replace(/\/$/, "") };
  } catch {
    return { value: null, error: "Enter a valid website address, for example www.example.com." };
  }
}

/** `create` needs the legal name and business type; an update may send either or both (the others keep their value). */
export function validateCompany(raw: unknown, mode: "create" | "update"): CompanyResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Fields = {};
  refuseForbidden(body, fields);
  for (const key of ["ownerUserId", "ownerId", "verificationStatus", "legalNameNormalized", "documents"]) if (key in body) fields[key] = "This value is set by the server and cannot be sent.";

  const legal = checkCompanyName(body.legalName);
  if (!legal.ok) fields.legalName = legal.error.replace("company name", "legal company name");

  const display = line(body.displayName, 150);
  if (display.length > 150) fields.displayName = "Keep the display name within 150 characters.";
  else if (/[<>]/.test(display)) fields.displayName = "Remove symbols such as < or > from the display name.";

  const type = BUSINESS_TYPES.find((t) => t === body.businessType);
  if (!type) fields.businessType = "Choose a business type.";

  const industry = line(body.industry, 100);
  if (industry.length > 100) fields.industry = "Keep the industry within 100 characters.";

  const description = multi(body.description, 1000);
  if (description.length > 1000) fields.description = "Keep the description within 1,000 characters.";
  else if (/[<>]/.test(description)) fields.description = "Remove symbols such as < or > from the description.";

  const site = checkWebsite(body.website);
  if (site.error) fields.website = site.error;

  let year: number | null = null;
  if (body.yearEstablished !== undefined && body.yearEstablished !== null && body.yearEstablished !== "") {
    const n = Number(body.yearEstablished);
    if (!Number.isInteger(n) || n < 1800 || n > new Date().getFullYear()) fields.yearEstablished = `Enter a year between 1800 and ${new Date().getFullYear()}.`;
    else year = n;
  }

  let companyEmail: string | null = null;
  if (typeof body.companyEmail === "string" && body.companyEmail.trim() !== "") {
    const email = checkEmail(body.companyEmail);
    if (!email.ok) fields.companyEmail = email.error;
    else companyEmail = normalizeEmail(email.value);
  }

  const country = COUNTRIES.find((c) => c.name === body.country)?.name ?? (body.country === undefined || body.country === "" ? "India" : null);
  if (!country) fields.country = "Choose a supported country.";

  const state = line(body.state, 60);
  if (state.length > 60 || /[<>]/.test(state)) fields.state = "Enter a valid state or province (up to 60 characters).";
  const city = line(body.city, 80);
  if (city.length > 80 || /[<>]/.test(city)) fields.city = "Enter a valid city (up to 80 characters).";

  const postal = country ? checkPostalCode(body.postalCode, country) : { ok: true as const, value: null };
  if (!postal.ok) fields.postalCode = postal.error;

  const registered = multi(body.registeredAddress, 200);
  if (registered.length > 200 || /[<>]/.test(registered)) fields.registeredAddress = "Keep the registered address within 200 characters, without < or >.";
  const operating = multi(body.operatingAddress, 200);
  if (operating.length > 200 || /[<>]/.test(operating)) fields.operatingAddress = "Keep the operating address within 200 characters, without < or >.";

  if (Object.keys(fields).length > 0 || !legal.ok || !type || !country) return { ok: false, fields };
  const version = typeof body.version === "number" && Number.isInteger(body.version) ? body.version : undefined;
  if (mode === "update" && version === undefined) return { ok: false, fields: { version: "Reload the page and try again." } };
  return {
    ok: true,
    version,
    value: {
      legalName: legal.value,
      displayName: display || null,
      businessType: type,
      industry: industry || null,
      description: description || null,
      website: site.value,
      yearEstablished: year,
      companyEmail,
      country,
      state: state || null,
      city: city || null,
      postalCode: postal.ok ? postal.value : null,
      registeredAddress: registered || null,
      operatingAddress: operating || null,
    },
  };
}

// ---------- documents ----------

export const documentLabel = (type: string) => DOCUMENT_TYPES.find((d) => d.value === type)?.label ?? "Document";
export const isDocumentType = (value: unknown): value is DocumentType => DOCUMENT_TYPES.some((d) => d.value === value);

/** Optional expiry date of a document: YYYY-MM-DD, a real date, not before 1990, not more than 30 years ahead. */
export function checkExpiry(raw: unknown, now = Date.now()): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: "Enter the expiry date as YYYY-MM-DD." };
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return { ok: false, error: "Enter a real date." };
  if (y < 1990 || date.getTime() > now + DOCUMENT_LIMITS.expiryYearsAhead * 365 * 86_400_000) return { ok: false, error: "Enter a sensible expiry date." };
  return { ok: true, value: raw };
}

// ---------- completion and next steps ----------

export interface CompletionInput {
  name: string;
  designation: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  company: { exists: boolean; businessType: boolean; location: boolean; description: boolean } | null;
  documentCount: number;
}

export interface CompletionItem {
  key: string;
  label: string;
  weight: number;
  met: boolean;
  /** The tab where the buyer can fix it. */
  tab: "personal" | "company" | "documents" | "verification";
}

/**
 * Profile completion: eight items with fixed weights that add up to 100. An item counts only when it is really met:
 * an unverified email or mobile number earns nothing, a missing company earns nothing. Business verification is NOT part of
 * it (it is a separate status). No sensitive identifier (GSTIN, PAN) is asked for in order to score.
 */
export function computeCompletion(input: CompletionInput): { percent: number; items: CompletionItem[] } {
  const c = input.company;
  const items: CompletionItem[] = [
    { key: "name", label: "Add your full name", weight: 10, met: input.name.trim().length >= 2, tab: "personal" },
    { key: "designation", label: "Add your designation", weight: 10, met: Boolean(input.designation), tab: "personal" },
    { key: "email", label: "Verify your primary email", weight: 15, met: input.emailVerified, tab: "verification" },
    { key: "phone", label: "Verify your mobile number", weight: 15, met: input.phoneVerified, tab: "verification" },
    { key: "company", label: "Add your company", weight: 15, met: Boolean(c?.exists), tab: "company" },
    { key: "businessType", label: "Choose the business type", weight: 10, met: Boolean(c?.businessType), tab: "company" },
    { key: "location", label: "Add the company city, state and PIN code", weight: 10, met: Boolean(c?.location), tab: "company" },
    { key: "documents", label: "Upload at least one company document", weight: 15, met: input.documentCount > 0, tab: "documents" },
  ];
  return { percent: items.reduce((sum, item) => sum + (item.met ? item.weight : 0), 0), items };
}
