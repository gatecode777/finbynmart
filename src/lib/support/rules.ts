import { checkEmail, checkMessage, checkName, checkPhone, hasConsent, isIdempotencyKey } from "@/lib/inquiries/rules";
import { CONSENT_VERSION } from "@/lib/legal";

/**
 * Contact Us rules, shared by the form and the server. Pure.
 *
 * A request is a message to Finbyn Mart (not to a supplier). Name, email, topic and message are required; the phone number
 * is optional but, when given, must be valid for the chosen country code. Nothing about the sender is "verified". The
 * consent box is never pre-ticked and is stored with its time and the wording version.
 */
export const SUPPORT_TOPICS = [
  { value: "BUYER_HELP", label: "Help as a buyer" },
  { value: "SUPPLIER_HELP", label: "Help as a supplier" },
  { value: "ACCOUNT", label: "Account or sign-in" },
  { value: "REPORT_PROBLEM", label: "Report a problem with the site" },
  { value: "FEEDBACK", label: "Feedback or suggestion" },
  { value: "OTHER", label: "Something else" },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"];

export const SUPPORT_REFERENCE_PATTERN = /^FBM-SUP-[0-9A-HJKMNP-TV-Z]{8}$/;

export interface SupportRequestInput {
  name: string;
  email: string;
  phone?: string;
  topic: SupportTopic;
  message: string;
  idempotencyKey?: string;
  consentPolicyVersion: string;
}

export type SupportResult = { ok: true; value: SupportRequestInput } | { ok: false; fields: Record<string, string> };

export function validateSupportRequest(raw: unknown): SupportResult {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields: Record<string, string> = {};

  const name = checkName(body.name);
  if (!name.ok) fields.name = name.error;
  const email = checkEmail(body.email);
  if (!email.ok) fields.email = email.error;

  const phoneRaw = body.phone && typeof body.phone === "object" && !Array.isArray(body.phone) ? (body.phone as Record<string, unknown>) : {};
  const phoneGiven = typeof phoneRaw.number === "string" && phoneRaw.number.trim() !== "";
  const phone = phoneGiven ? checkPhone(phoneRaw.number, phoneRaw.countryCode) : null;
  if (phone && !phone.ok) fields.phone = phone.error;

  const topic = SUPPORT_TOPICS.find((item) => item.value === body.topic)?.value;
  if (!topic) fields.topic = "Choose what your message is about.";

  const message = checkMessage(body.message);
  if (!message.ok) fields.message = message.error.replace("Describe your requirement", "Tell us how we can help");

  if (!hasConsent(body.consent)) fields.consent = "Tick the box to agree before sending.";
  else if (body.consentPolicyVersion !== CONSENT_VERSION) fields.consent = "This form is out of date. Reload the page and try again.";

  if (body.idempotencyKey !== undefined && !isIdempotencyKey(body.idempotencyKey)) fields.idempotencyKey = "Reload the page and try again.";

  if (Object.keys(fields).length > 0 || !name.ok || !email.ok || !message.ok || !topic) return { ok: false, fields };
  return {
    ok: true,
    value: {
      name: name.value,
      email: email.value,
      ...(phone && phone.ok ? { phone: phone.value } : {}),
      topic,
      message: message.value,
      ...(typeof body.idempotencyKey === "string" ? { idempotencyKey: body.idempotencyKey } : {}),
      consentPolicyVersion: CONSENT_VERSION,
    },
  };
}
