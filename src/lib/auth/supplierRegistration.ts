import { checkEmail, checkPhone } from "@/lib/inquiries/rules";
import { CONSENT_VERSION } from "@/lib/legal";
import { checkBuyerPassword, checkCompanyName, checkFullName, FORBIDDEN_FIELDS, normalizeEmail } from "./buyerRegistration";

/**
 * Supplier registration rules (form and server). Same account rules as the buyer form (password, email, phone, consent,
 * server-only fields refused) plus the business details. A supplier account is NOT a verified supplier: nothing here checks
 * the business, and the stored record says so by omission (there is no verified flag to set).
 */
export const CITY_MAX = 80;
export const OFFERING_MIN = 10;
export const OFFERING_MAX = 500;

export interface SupplierRegistration {
  contactName: string;
  email: string;
  phone: { countryCode: string; number: string; normalized: string };
  businessName: string;
  city: string;
  offering: string;
  password: string;
  consentPolicyVersion: string;
}

export type SupplierRegistrationResult = { ok: true; value: SupplierRegistration } | { ok: false; fields: Record<string, string> };

const line = (value: unknown, max: number) => (typeof value === "string" ? value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "");

export function validateSupplierSignup(raw: unknown): SupplierRegistrationResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};
  for (const key of FORBIDDEN_FIELDS) if (key in body) fields[key] = "This value is set by the server and cannot be sent.";

  const contact = checkFullName(body.contactName);
  if (!contact.ok) fields.contactName = contact.error;
  const email = checkEmail(body.email);
  if (!email.ok) fields.email = email.error;
  const phoneRaw = body.phone && typeof body.phone === "object" && !Array.isArray(body.phone) ? (body.phone as Record<string, unknown>) : {};
  const phone = checkPhone(phoneRaw.number, phoneRaw.countryCode);
  if (!phone.ok) fields.phone = phone.error;
  const business = checkCompanyName(body.businessName);
  if (!business.ok) fields.businessName = business.error.replace("company name", "business name");

  const city = line(body.city, CITY_MAX);
  if (city.length < 2) fields.city = "Enter your city.";
  else if (city.length > CITY_MAX || !/^[\p{L}\p{M}\p{N} ,.\-()/&']+$/u.test(city)) fields.city = "Use letters, numbers and ordinary punctuation only (up to 80 characters).";

  const offering = line(body.offering, OFFERING_MAX);
  if (offering.length < OFFERING_MIN) fields.offering = `Tell us what you supply (at least ${OFFERING_MIN} characters).`;
  else if (offering.length > OFFERING_MAX || /[<>]/.test(offering)) fields.offering = `Keep it within ${OFFERING_MAX} characters, without < or >.`;

  const problem = checkBuyerPassword(body.password);
  if (problem) fields.password = problem;
  if (typeof body.confirmPassword !== "string" || body.confirmPassword.length === 0) fields.confirmPassword = "Re-enter your password.";
  else if (body.confirmPassword !== body.password) fields.confirmPassword = "The two passwords do not match.";

  if (body.consent !== true) fields.consent = "Tick the box to agree before creating your account.";
  else if (body.consentPolicyVersion !== CONSENT_VERSION) fields.consent = "This form is out of date. Reload the page and try again.";

  if (Object.keys(fields).length > 0 || !contact.ok || !email.ok || !phone.ok || !business.ok) return { ok: false, fields };
  const [countryCode, ...rest] = phone.value.split(" ");
  return { ok: true, value: { contactName: contact.value, email: normalizeEmail(email.value), phone: { countryCode, number: rest.join(" "), normalized: phone.value }, businessName: business.value, city, offering, password: body.password as string, consentPolicyVersion: CONSENT_VERSION } };
}
