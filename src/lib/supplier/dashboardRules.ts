import { normaliseStatus, type InquiryStatus } from "@/lib/inquiries/rules";
import { AWAITING_STATUSES } from "@/lib/inquiries/buyerListRules";
import type { StoredStatus } from "@/lib/quotations/quotationRules";

/**
 * Supplier dashboard rules (Page 39). Pure (no database), shared by the service, the page and the node-run unit tests. Every number the dashboard
 * shows is defined here once; docs/backend/PAGE_39_SUPPLIER_KPI_RULES.md is the readable version.
 */

// ---------- KPI definitions ----------
/** Inquiries that need the supplier's action now: the same group the buyer's My Inquiries calls "awaiting a response" (one definition). */
export const PENDING_INQUIRY_STATUSES: readonly string[] = [...AWAITING_STATUSES, "new"];

/** A quotation is "active" while it is the CURRENT version of its lineage, was sent, still waits on a decision (SENT, or a revision was asked) and has not expired. Drafts, superseded versions, withdrawn, accepted, rejected and expired ones are not active. */
export const ACTIVE_QUOTATION_STATUSES: readonly StoredStatus[] = ["SENT", "REVISION_REQUESTED"];

/** An order is "confirmed" once it left PENDING_CONFIRMATION and was not cancelled. (A cancellation REQUEST is not yet a cancellation.) */
export const UNCONFIRMED_ORDER_STATUSES: readonly string[] = ["PENDING_CONFIRMATION", "CANCELLED"];

/** Supplier-facing words for an inquiry's stored status (one mapping; the supplier never sees buyer-side wording that does not apply). */
export const SUPPLIER_INQUIRY_LABEL: Record<InquiryStatus, string> = {
  NEW: "New",
  NOTIFIED: "New",
  IN_PROGRESS: "Pending Response",
  REPLIED: "Replied",
  QUOTED: "Quoted",
  CLOSED: "Closed",
  CANCELLED: "Cancelled by Buyer",
  REJECTED: "Declined",
};

export const supplierInquiryStatus = (stored: string | undefined) => {
  const status = normaliseStatus(stored);
  return { status, label: SUPPLIER_INQUIRY_LABEL[status], pending: PENDING_INQUIRY_STATUSES.includes(status) || PENDING_INQUIRY_STATUSES.includes(status.toLowerCase()) };
};

// ---------- profile completion ----------
/**
 * Only fields the application can actually capture today count, each with a fixed weight (they sum to 100). Logo, banner, business type,
 * categories, website and the product catalogue cannot be entered anywhere yet, so they are NOT in the score (a score that required them would
 * be impossible to reach). A complete profile is never "verified": verification is a separate status that does not exist yet.
 */
export interface ProfileInput {
  displayName: string | null;
  contactName: string | null;
  city: string | null;
  phone: string | null;
  description: string | null;
  emailVerified: boolean;
}

export interface ProfileCheck {
  key: string;
  label: string;
  weight: number;
  done: boolean;
  hint: string;
}

const PLACEHOLDER = /^(n\/?a|na|none|nil|null|test|testing|demo|sample|xxx+|asdf+|abc+|lorem.*|-+|\.+|todo|tbd)$/i;
const meaningful = (text: string | null, minLength: number, minWords: number) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < minLength || PLACEHOLDER.test(t)) return false;
  if (new Set(t.toLowerCase().replace(/[^a-z0-9]/g, "")).size < Math.min(8, minLength)) return false; // "aaaaaaaa", "1111111111"
  return t.split(" ").length >= minWords;
};

export function profileChecks(p: ProfileInput): ProfileCheck[] {
  const digits = (p.phone ?? "").replace(/\D/g, "");
  return [
    { key: "businessName", label: "Business name", weight: 20, done: meaningful(p.displayName, 2, 1), hint: "Enter your registered business name." },
    { key: "description", label: "Business description", weight: 25, done: meaningful(p.description, 40, 6), hint: "Describe what you supply in at least 40 characters (about six words)." },
    { key: "city", label: "Business city", weight: 15, done: meaningful(p.city, 2, 1), hint: "Add the city your business operates from." },
    { key: "phone", label: "Business phone", weight: 15, done: digits.length >= 8 && digits.length <= 15, hint: "Add a phone number of 8 to 15 digits." },
    { key: "contactName", label: "Contact person", weight: 10, done: meaningful(p.contactName, 2, 1), hint: "Add the name of your contact person." },
    { key: "emailVerified", label: "Email address confirmed", weight: 15, done: p.emailVerified, hint: "Confirm your email address from the link sent to you." },
  ];
}

export const PROFILE_NOT_COUNTED = [
  { key: "logo", label: "Company logo", reason: "Logo upload is not available yet." },
  { key: "banner", label: "Company banner", reason: "Banner upload is not available yet." },
  { key: "businessType", label: "Business type and categories", reason: "They cannot be entered yet." },
  { key: "website", label: "Website", reason: "It cannot be entered yet." },
  { key: "products", label: "Product catalogue", reason: "Supplier product management is not available yet." },
] as const;

export function computeProfileCompletion(p: ProfileInput) {
  const checks = profileChecks(p);
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const done = checks.filter((c) => c.done).reduce((s, c) => s + c.weight, 0);
  return { percent: Math.round((done / total) * 100), checks, missing: checks.filter((c) => !c.done), notCounted: PROFILE_NOT_COUNTED };
}

// ---------- paging of the lists ----------
export const RECENT_DEFAULT = 5;
export const RECENT_MAX = 10;
export const TOP_DEFAULT = 5;
export const TOP_MAX = 10;
