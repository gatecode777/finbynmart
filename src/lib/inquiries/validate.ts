import { validateQuantity } from "@/lib/catalog/quantity";
import { unitKey } from "@/lib/catalog/listingQuery";
import {
  INQUIRY_TYPES,
  PHONE_COUNTRIES,
  canonicalUnit,
  checkCompany,
  checkEmail,
  checkLocation,
  checkMessage,
  checkName,
  checkPhone,
  hasConsent,
  inquiryTypeNeedsProduct,
  isIdempotencyKey,
  normaliseInquiryType,
  type GuestContact,
  type InquiryType,
  type Located,
} from "./rules";

/** What the chosen product dictates (its unit and minimum order); absent for an inquiry to the supplier in general. */
export interface ProductContext {
  moq?: { quantity: number; unit: string };
  unit?: string;
}

export interface ValidInquiry {
  inquiryType: InquiryType;
  quantity: number;
  unit?: string;
  message: string;
  deliveryLocation?: Located;
  guest?: GuestContact;
  idempotencyKey?: string;
}

export type InquiryValidation = { ok: true; value: ValidInquiry } | { ok: false; fields: Record<string, string> };

/** "+91 98765 43210" -> { code: "+91", number: "98765 43210" }; a bare number uses the given code (India by default). */
function splitPhone(raw: unknown, rawCode: unknown): { code: unknown; number: unknown } {
  if (typeof raw === "string" && raw.trim().startsWith("+")) {
    const text = raw.trim();
    const match = [...PHONE_COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((country) => text.startsWith(country.code));
    return match ? { code: match.code, number: text.slice(match.code.length) } : { code: undefined, number: text };
  }
  return { code: rawCode ?? "+91", number: raw };
}

/**
 * Validates every field of an inquiry in one pass and reports all problems together. Shared in spirit with the form,
 * which runs the same rules from rules.ts; the server's answer is the one that counts. Nothing is changed for the buyer:
 * a quantity or unit that does not fit is an error, never a silent correction. The product (or its absence) is
 * resolved by the route and passed in, with `productError` when the product named by the buyer cannot be used.
 */
export function validateInquiry(
  body: Record<string, unknown>,
  options: { signedIn: boolean; product?: ProductContext; productError?: string },
): InquiryValidation {
  const fields: Record<string, string> = {};

  const inquiryType = normaliseInquiryType(body.inquiryType);
  if (!inquiryType) fields.inquiryType = `Choose one of: ${INQUIRY_TYPES.map((type) => type.label).join(", ")}.`;

  if (options.productError) fields.product = options.productError;
  else if (inquiryType && inquiryTypeNeedsProduct(inquiryType) && !options.product) fields.product = "Choose the product you are asking about.";

  const rules = options.product ? { moq: options.product.moq, unit: options.product.unit } : {};
  const given = typeof body.quantityUnit === "string" ? body.quantityUnit : typeof body.unit === "string" ? body.unit : "";
  let unit: string | undefined;
  if (options.product) unit = given || undefined;
  else {
    unit = canonicalUnit(given, unitKey) ?? undefined;
    if (!unit) fields.unit = "Choose the unit of your quantity.";
  }
  const quantityResult = validateQuantity(body.quantity, unit, rules);
  if (!quantityResult.ok) fields.quantity = quantityResult.message;

  const message = checkMessage(body.message);
  if (!message.ok) fields.message = message.error;

  const location = checkLocation(typeof body.deliveryLocation === "string" ? body.deliveryLocation : (body.deliveryLocation as { text?: unknown } | null | undefined)?.text);
  if (!location.ok) fields.deliveryLocation = location.error;

  let guest: GuestContact | undefined;
  if (!options.signedIn) {
    const details = (body.guestDetails && typeof body.guestDetails === "object" ? body.guestDetails : {}) as Record<string, unknown>;
    const name = checkName(details.name);
    const email = checkEmail(details.email);
    const { code, number } = splitPhone(details.phone, details.countryCode);
    const phone = checkPhone(number, code);
    const company = checkCompany(details.companyName);
    if (!name.ok) fields.name = name.error;
    if (!email.ok) fields.email = email.error;
    if (!phone.ok) fields.phone = phone.error;
    if (!company.ok) fields.companyName = company.error;
    if (name.ok && email.ok && phone.ok && company.ok) guest = { name: name.value, email: email.value, phone: phone.value, ...(company.value ? { companyName: company.value } : {}) };
  }

  if (!hasConsent(body.consent)) fields.consent = "Tick the box to agree before sending your inquiry.";

  const key = body.idempotencyKey;
  if (key !== undefined && key !== null && !isIdempotencyKey(key)) fields.idempotencyKey = "Invalid request key.";

  if (Object.keys(fields).length > 0 || !inquiryType || !quantityResult.ok || !message.ok || !location.ok) return { ok: false, fields };
  return {
    ok: true,
    value: {
      inquiryType,
      quantity: quantityResult.quantity,
      unit: quantityResult.unit,
      message: message.value,
      deliveryLocation: location.value,
      guest,
      idempotencyKey: typeof key === "string" ? key : undefined,
    },
  };
}
