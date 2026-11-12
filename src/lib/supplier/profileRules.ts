import { checkEmail, checkPhone } from "@/lib/inquiries/rules";
import { checkCompanyName, checkFullName, normalizeEmail } from "@/lib/auth/buyerRegistration";

export const SUPPLIER_BUSINESS_TYPES = [
  "Manufacturer",
  "Wholesaler / Distributor",
  "Trader / Retailer",
  "Exporter / Importer",
  "Service Provider",
  "Proprietorship",
  "Partnership",
  "Private Limited",
  "Public Limited",
  "LLP",
  "Other",
] as const;

export const SUPPLIER_DOCUMENT_TYPES = [
  { value: "GST_CERTIFICATE", label: "GST Registration Certificate" },
  { value: "PAN_DOCUMENT", label: "PAN Card / Document" },
  { value: "INCORPORATION_CERTIFICATE", label: "Certificate of Incorporation" },
  { value: "MSME_UDYAM", label: "MSME / Udyam Registration" },
  { value: "TRADE_LICENSE", label: "Trade License / Shop & Establishment" },
  { value: "FACTORY_LICENSE", label: "Factory License / Industrial Permit" },
  { value: "ADDRESS_PROOF", label: "Business Address Proof" },
  { value: "OTHER", label: "Other Verification Document" },
] as const;

export type SupplierDocumentType = (typeof SUPPLIER_DOCUMENT_TYPES)[number]["value"];
export type SupplierDocumentStatus = "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";

export const SUPPLIER_DOCUMENT_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // 10MB
  extensions: ["pdf", "jpg", "jpeg", "png"] as const,
};

export const FORBIDDEN_SUPPLIER_FIELDS = [
  "_id",
  "id",
  "role",
  "accountStatus",
  "status",
  "emailVerified",
  "phoneVerified",
  "passwordHash",
  "permissions",
  "verificationStatus",
  "sellerKeys",
  "createdAt",
  "ownerUserId",
] as const;

const line = (value: unknown, max: number) =>
  typeof value === "string" ? value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "";

const multi = (value: unknown, max: number) =>
  typeof value === "string" ? value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max + 1) : "";

type Fields = Record<string, string>;

function refuseForbidden(body: Record<string, unknown>, fields: Fields) {
  for (const key of FORBIDDEN_SUPPLIER_FIELDS) {
    if (key in body) fields[key] = "This value is protected and cannot be changed from the form.";
  }
}

export interface SupplierPersonalInput {
  name: string;
  designation: string | null;
  alternatePhone: { countryCode: string; number: string; normalized: string } | null;
  alternateEmail: string | null;
  version: number;
}

export type SupplierPersonalResult = { ok: true; value: SupplierPersonalInput } | { ok: false; fields: Fields };

export function validateSupplierPersonalUpdate(raw: unknown, primaryEmail: string): SupplierPersonalResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Fields = {};
  refuseForbidden(body, fields);

  const name = checkFullName(body.name);
  if (!name.ok) fields.name = name.error;

  const designation = line(body.designation, 100);
  if (designation.length > 100) fields.designation = "Keep the designation within 100 characters.";
  else if (/[<>]/.test(designation)) fields.designation = "Remove symbols such as < or > from the designation.";

  let alternatePhone: SupplierPersonalInput["alternatePhone"] = null;
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

  const version = typeof body.version === "number" ? body.version : 0;

  if (Object.keys(fields).length > 0 || !name.ok) return { ok: false, fields };
  return { ok: true, value: { name: name.value, designation: designation || null, alternatePhone, alternateEmail, version } };
}

export interface SupplierCompanyInput {
  businessName: string;
  displayName: string | null;
  businessType: string;
  industry: string | null;
  description: string | null;
  website: string | null;
  yearEstablished: number | null;
  country: string;
  state: string | null;
  city: string | null;
  postalCode: string | null;
  registeredAddress: string | null;
  operatingAddress: string | null;
  version: number;
}

export type SupplierCompanyResult = { ok: true; value: SupplierCompanyInput } | { ok: false; fields: Fields };

export function checkPinCode(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const code = line(raw, 10).replace(/\s+/g, "");
  if (!code) return { ok: true, value: null };
  return /^[1-9]\d{5}$/.test(code) ? { ok: true, value: code } : { ok: false, error: "A valid PIN code has 6 digits and does not start with 0." };
}

export function validateSupplierCompany(raw: unknown): SupplierCompanyResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Fields = {};
  refuseForbidden(body, fields);

  const businessName = checkCompanyName(body.businessName);
  if (!businessName.ok) fields.businessName = businessName.error.replace("company name", "business / company name");

  const displayName = line(body.displayName, 150);
  if (displayName.length > 150) fields.displayName = "Keep the display name within 150 characters.";

  const businessType = typeof body.businessType === "string" && body.businessType.trim() ? line(body.businessType, 60) : "Manufacturer";

  const industry = line(body.industry, 100);
  if (industry.length > 100) fields.industry = "Keep the industry within 100 characters.";

  const description = multi(body.description, 2000);
  if (description.length > 2000) fields.description = "Keep the company description within 2,000 characters.";

  let website: string | null = null;
  if (typeof body.website === "string" && body.website.trim() !== "") {
    const text = line(body.website, 200);
    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || /\s/.test(url.hostname)) {
        fields.website = "Enter a valid website address, for example www.example.com";
      } else {
        website = url.toString().replace(/\/$/, "");
      }
    } catch {
      fields.website = "Enter a valid website address, for example www.example.com";
    }
  }

  let yearEstablished: number | null = null;
  if (body.yearEstablished !== undefined && body.yearEstablished !== null && body.yearEstablished !== "") {
    const yr = Number(body.yearEstablished);
    const currentYr = new Date().getFullYear();
    if (!Number.isInteger(yr) || yr < 1800 || yr > currentYr) {
      fields.yearEstablished = `Enter a valid 4-digit year between 1800 and ${currentYr}.`;
    } else {
      yearEstablished = yr;
    }
  }

  const country = typeof body.country === "string" && body.country.trim() ? line(body.country, 60) : "India";
  const state = line(body.state, 80);
  const city = line(body.city, 80);
  if (!city) fields.city = "City is required.";

  const pin = checkPinCode(body.postalCode);
  if (!pin.ok) fields.postalCode = pin.error;

  const registeredAddress = multi(body.registeredAddress, 500);
  const operatingAddress = multi(body.operatingAddress, 500);
  const version = typeof body.version === "number" ? body.version : 0;

  if (Object.keys(fields).length > 0 || !businessName.ok || !pin.ok) return { ok: false, fields };

  return {
    ok: true,
    value: {
      businessName: businessName.value,
      displayName: displayName || null,
      businessType,
      industry: industry || null,
      description: description || null,
      website,
      yearEstablished,
      country,
      state: state || null,
      city: city || null,
      postalCode: pin.value,
      registeredAddress: registeredAddress || null,
      operatingAddress: operatingAddress || null,
      version,
    },
  };
}
