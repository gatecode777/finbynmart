import { checkPhone } from "@/lib/inquiries/rules";
import { checkCompanyName, checkFullName } from "@/lib/auth/buyerRegistration";
import { COUNTRIES, FORBIDDEN_PROFILE_FIELDS, checkPostalCode } from "./profileRules";

/**
 * Address book rules shared by the form (instant feedback) and the server (authoritative). Pure.
 *
 * One saved address can serve several purposes (for example Business + Billing). The two defaults are independent: one default
 * billing address and one default delivery address per buyer, each allowed only on an address that has the matching purpose.
 * A purpose is a label for how the buyer uses the address; it says nothing about the address being verified.
 */
export const ADDRESS_PURPOSES = [
  { value: "BUSINESS", label: "Business" },
  { value: "BILLING", label: "Billing" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "GOODS_RECEIVING", label: "Goods Receiving" },
  { value: "BRANCH_OFFICE", label: "Branch Office" },
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "FACTORY", label: "Factory" },
  { value: "OTHER", label: "Other" },
] as const;

export type AddressPurpose = (typeof ADDRESS_PURPOSES)[number]["value"];
export const purposeLabel = (p: string) => ADDRESS_PURPOSES.find((x) => x.value === p)?.label ?? p;

/** The most addresses one buyer may keep (a policy cap that also bounds every query). */
export const MAX_ADDRESSES = 50;
export const SEARCH_MAX = 60;

export const ADDRESS_FILTERS = [
  { value: "all", label: "All Addresses" },
  { value: "delivery", label: "Delivery" },
  { value: "billing", label: "Billing" },
  { value: "business", label: "Business" },
] as const;
export type AddressFilter = (typeof ADDRESS_FILTERS)[number]["value"];

/** The purpose a filter selects (an address with several purposes appears under each filter it matches). */
export const FILTER_PURPOSE: Record<Exclude<AddressFilter, "all">, AddressPurpose> = { delivery: "DELIVERY", billing: "BILLING", business: "BUSINESS" };

const SERVER_ONLY = ["buyerId", "companyId", "deletedAt", "normalizedPhone", "updatedAt", "ownerUserId", "id"];

const line = (value: unknown, max: number) => (typeof value === "string" ? value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");
type Fields = Record<string, string>;

export interface AddressInput {
  label: string;
  purposes: AddressPurpose[];
  contactPerson: string | null;
  companyName: string | null;
  phone: { countryCode: string; number: string; normalized: string } | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  /** Only the bits the buyer actually sent: absent means "leave as it is" on an update. */
  isDefaultBilling?: boolean;
  isDefaultDelivery?: boolean;
  forCompany?: boolean;
  version?: number;
}

export type AddressResult = { ok: true; value: AddressInput } | { ok: false; fields: Fields };

export function validateAddress(raw: unknown, mode: "create" | "update"): AddressResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Fields = {};
  for (const key of [...FORBIDDEN_PROFILE_FIELDS, ...SERVER_ONLY]) if (key in body) fields[key] = "This value is set by the server and cannot be sent.";

  const label = line(body.label, 60);
  if (label.length < 2) fields.label = "Give the address a label of at least 2 characters (for example Head Office).";
  else if (label.length > 60 || /[<>]/.test(label)) fields.label = "Keep the label within 60 characters, without < or >.";

  const given = Array.isArray(body.purposes) ? body.purposes : [];
  const purposes = [...new Set(given)].filter((p): p is AddressPurpose => ADDRESS_PURPOSES.some((x) => x.value === p));
  if (!Array.isArray(body.purposes) || purposes.length === 0) fields.purposes = "Choose at least one purpose.";
  else if (given.some((p) => !ADDRESS_PURPOSES.some((x) => x.value === p))) fields.purposes = "One of the chosen purposes is not valid.";
  const needsContact = purposes.includes("DELIVERY") || purposes.includes("GOODS_RECEIVING");

  let contactPerson: string | null = null;
  const personText = line(body.contactPerson, 100);
  if (personText) {
    const person = checkFullName(personText);
    if (!person.ok) fields.contactPerson = person.error;
    else contactPerson = person.value;
  } else if (needsContact) fields.contactPerson = "Enter the name of the person who receives goods at this address.";

  let companyName: string | null = null;
  if (line(body.companyName, 150)) {
    const company = checkCompanyName(body.companyName);
    if (!company.ok) fields.companyName = company.error;
    else companyName = company.value;
  }

  let phone: AddressInput["phone"] = null;
  const phoneRaw = body.phone && typeof body.phone === "object" && !Array.isArray(body.phone) ? (body.phone as Record<string, unknown>) : {};
  if (typeof phoneRaw.number === "string" && phoneRaw.number.trim() !== "") {
    const checked = checkPhone(phoneRaw.number, phoneRaw.countryCode);
    if (!checked.ok) fields.phone = checked.error;
    else {
      const [countryCode, ...rest] = checked.value.split(" ");
      phone = { countryCode, number: rest.join(" "), normalized: checked.value };
    }
  } else if (needsContact) fields.phone = "Enter a contact phone number for delivery and goods receiving.";

  const line1 = line(body.addressLine1, 150);
  if (line1.length < 3) fields.addressLine1 = "Enter the address (at least 3 characters).";
  else if (line1.length > 150 || /[<>]/.test(line1)) fields.addressLine1 = "Keep it within 150 characters, without < or >.";
  const line2 = line(body.addressLine2, 150);
  if (line2.length > 150 || /[<>]/.test(line2)) fields.addressLine2 = "Keep it within 150 characters, without < or >.";
  const landmark = line(body.landmark, 100);
  if (landmark.length > 100 || /[<>]/.test(landmark)) fields.landmark = "Keep the landmark within 100 characters, without < or >.";

  const country = COUNTRIES.find((c) => c.name === body.country)?.name ?? null;
  if (!country) fields.country = "Choose a supported country.";
  const state = line(body.state, 60);
  if (state.length < 2 || state.length > 60 || /[<>]/.test(state)) fields.state = "Enter the state or province (2 to 60 characters).";
  const city = line(body.city, 80);
  if (city.length < 2 || city.length > 80 || /[<>]/.test(city)) fields.city = "Enter the city (2 to 80 characters).";
  let postalCode = "";
  if (country) {
    const postal = checkPostalCode(body.postalCode, country);
    if (!postal.ok) fields.postalCode = postal.error;
    else if (!postal.value) fields.postalCode = country === "India" ? "Enter the six-digit PIN code." : "Enter the postal code.";
    else postalCode = postal.value;
  }

  const flag = (key: string): boolean | undefined => {
    if (body[key] === undefined) return undefined;
    if (typeof body[key] !== "boolean") {
      fields[key] = "Send true or false.";
      return undefined;
    }
    return body[key] as boolean;
  };
  const isDefaultBilling = flag("isDefaultBilling");
  const isDefaultDelivery = flag("isDefaultDelivery");
  if (isDefaultBilling === true && !purposes.includes("BILLING")) fields.isDefaultBilling = "Only a Billing address can be the default billing address.";
  if (isDefaultDelivery === true && !purposes.includes("DELIVERY")) fields.isDefaultDelivery = "Only a Delivery address can be the default delivery address.";
  const forCompany = flag("forCompany");

  let version: number | undefined;
  if (mode === "update") {
    if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) fields.version = "Reload the page and try again.";
    else version = body.version;
  }

  if (Object.keys(fields).length > 0 || !country) return { ok: false, fields };
  return { ok: true, value: { label, purposes, contactPerson, companyName, phone, addressLine1: line1, addressLine2: line2 || null, landmark: landmark || null, country, state, city, postalCode, isDefaultBilling, isDefaultDelivery, forCompany, version } };
}

export interface AddressQuery {
  type: AddressFilter;
  q: string;
  page: number;
  limit: number;
}

export type QueryResult = { ok: true; value: AddressQuery } | { ok: false; error: string };

/** Parses the list query: type, q (at most 60 characters), page and limit (1 to 50). */
export function parseAddressQuery(params: { type?: unknown; q?: unknown; page?: unknown; limit?: unknown }): QueryResult {
  const type = params.type === undefined || params.type === "" ? "all" : params.type;
  if (!ADDRESS_FILTERS.some((f) => f.value === type)) return { ok: false, error: "type must be all, delivery, billing or business." };
  const q = typeof params.q === "string" ? params.q.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (q.length > SEARCH_MAX) return { ok: false, error: `The search text can be at most ${SEARCH_MAX} characters.` };
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const page = num(params.page, 1, 1, 1000);
  const limit = num(params.limit, MAX_ADDRESSES, 1, MAX_ADDRESSES);
  if (page === null || limit === null) return { ok: false, error: `page must be 1 or more and limit between 1 and ${MAX_ADDRESSES}.` };
  return { ok: true, value: { type: type as AddressFilter, q, page, limit } };
}

export interface AddressSnapshot {
  label: string;
  contactPerson: string | null;
  companyName: string | null;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * The immutable copy an order, invoice or quotation must store when it uses an address. It carries no id and no link back to
 * the address book, so editing or deleting the saved address later cannot change a confirmed record. (No order or checkout
 * exists yet; this is the data contract they will use.)
 */
export function toAddressSnapshot(address: { label: string; contactPerson: string | null; companyName: string | null; phone: { normalized: string } | null; addressLine1: string; addressLine2: string | null; landmark: string | null; city: string; state: string; postalCode: string; country: string }): AddressSnapshot {
  return { label: address.label, contactPerson: address.contactPerson, companyName: address.companyName, phone: address.phone?.normalized ?? null, addressLine1: address.addressLine1, addressLine2: address.addressLine2, landmark: address.landmark, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country };
}

/** "Jaipur, Rajasthan 302018": the text an inquiry's location field takes. */
export const locationText = (a: { city: string; state: string; postalCode: string }) => `${a.city}, ${a.state} ${a.postalCode}`.trim();
