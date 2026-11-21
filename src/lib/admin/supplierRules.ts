/**
 * Client-safe rules of Admin Supplier Management (no server imports: the browser, the API and the node unit tests share them).
 *
 * Identities kept apart (never one mixed "supplier"):
 *  - the supplier USER ACCOUNT (`users`, role supplier): a person who signs in;
 *  - the supplier COMPANY (`supplier_companies`): the unit this page manages (one company per owner account today; the company profile lives on the company document);
 *  - company MEMBERSHIP: not a separate model (the owner is the only member), so staff and members are never counted here;
 *  - the CATALOGUE SELLER identities a company owns (`sellerKeys`, linked only by the admin Company Links tool) plus its own implicit key `co:<id>`;
 *  - company VERIFICATION: no workflow exists (always unverified); it is Page 53, never this page;
 *  - PUBLIC PRODUCT ELIGIBILITY: a product's own review/unpublish state AND the company being ACTIVE (a separate fact).
 * A company without a linked catalogue seller is normal: its own products use the implicit company identity. It is never "inactive" or "invalid" for that reason.
 */
import { cleanReason, validateReason } from "./inquiryRules";

export { cleanReason, validateReason };

export const COMPANY_STATUSES = [
  { key: "all", label: "All statuses" },
  { key: "ACTIVE", label: "Active" },
  { key: "SUSPENDED", label: "Suspended" },
] as const;
export type StatusFilter = (typeof COMPANY_STATUSES)[number]["key"];
export const STATUS_KEYS = COMPANY_STATUSES.map((s) => s.key) as readonly string[];
export const STATUS_LABEL = { ACTIVE: "Active", SUSPENDED: "Suspended" } as const;

export const MAPPING_FILTERS = [
  { key: "all", label: "All" },
  { key: "linked", label: "Has linked catalogue sellers" },
  { key: "none", label: "No linked catalogue seller" },
] as const;
export type MappingFilter = (typeof MAPPING_FILTERS)[number]["key"];
export const MAPPING_KEYS = MAPPING_FILTERS.map((m) => m.key) as readonly string[];

export const SORTS = [
  { key: "updated", label: "Last updated" },
  { key: "name", label: "Company name" },
  { key: "created", label: "Newest company" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];
export const SORT_KEYS = SORTS.map((s) => s.key) as readonly string[];

/** Fixed, supplier-safe wording for the in-app notice. The internal reason is never shown to the supplier (and no free text is). */
export const NOTICE_CODES = [
  { key: "POLICY_REVIEW", label: "Marketplace policy review" },
  { key: "INFORMATION_NEEDED", label: "More information needed" },
  { key: "ACCOUNT_SAFETY", label: "Account safety check" },
] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number]["key"];
export const NOTICE_KEYS = NOTICE_CODES.map((n) => n.key) as readonly string[];
export const NOTICE_TEXT: Record<NoticeCode, string> = {
  POLICY_REVIEW: "Your company access was restricted while a marketplace policy review is completed.",
  INFORMATION_NEEDED: "Your company access was restricted because more information is needed.",
  ACCOUNT_SAFETY: "Your company access was restricted while an account safety check is completed.",
};

export const PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_PAGE = 1000;
export const SEARCH_MAX = 60;
export const EXPORT_MAX = 5000;
export const COMPANY_ID_RE = /^[a-f0-9]{24}$/;
/** The short code shown beside a company: CMP- plus the last 8 hex characters of its id. The full 24-character id is the only lookup key. */
export const refCode = (id: string): string => `CMP-${id.slice(-8).toUpperCase()}`;
export const CODE_RE = /^CMP-[A-F0-9]{8}$/;

export type CompanyAction = "suspend" | "reactivate";
export interface ActionState { permitted: boolean; available: boolean; reason: string | null }

/**
 * What each status action allows right now (the server recomputes it at commit time). Suspending needs an ACTIVE company, reactivating a SUSPENDED one.
 * Neither action touches verification, product moderation, product-specific restrictions, seller ownership or history.
 */
export function actionPlan(status: "ACTIVE" | "SUSPENDED", caps: { suspend: boolean; reactivate: boolean }): Record<CompanyAction, ActionState> {
  return {
    suspend: { permitted: caps.suspend, available: caps.suspend && status === "ACTIVE", reason: caps.suspend && status !== "ACTIVE" ? "The company is already suspended." : null },
    reactivate: { permitted: caps.reactivate, available: caps.reactivate && status === "SUSPENDED", reason: caps.reactivate && status !== "SUSPENDED" ? "Only a suspended company can be reactivated." : null },
  };
}

/** Plain consequences shown before confirming (the same list the policy document states). */
export const SUSPEND_EFFECTS = [
  "The company's own products and its supplier page leave public discovery (search, categories, product and supplier pages).",
  "Buyers can no longer send it new direct inquiries, and it receives no new matched leads.",
  "Its supplier workspace is closed: no quotation, order, product or inquiry action can be taken until it is reactivated. Support and account security stay available.",
  "Everything already stored (inquiries, conversations, quotations, orders, accepted prices) is kept unchanged.",
  "The owner's other roles and personal sign-in are not affected, and no session is revoked.",
] as const;
export const REACTIVATE_EFFECTS = [
  "Restores company access and eligibility for new inquiries and matched leads.",
  "Does not verify the company, approve pending products, clear a product's own unpublish restriction, reopen closed requirements, restore expired quotations, transfer seller ownership or replay past leads.",
  "Products that were approved and are not individually unpublished become public again.",
] as const;

// ---------------------------------------------------------------- list state
export interface SupplierListState { q: string; status: StatusFilter; mapping: MappingFilter; city: string; sort: SortKey; page: number }
export const EMPTY_STATE: SupplierListState = { q: "", status: "all", mapping: "all", city: "", sort: "updated", page: 1 };
export const cleanText = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseListState(sp: URLSearchParams): SupplierListState {
  const pick = <T extends string>(v: string | null, allowed: readonly string[], fallback: T): T => (v && allowed.includes(v) ? (v as T) : fallback);
  const page = Number(sp.get("page"));
  return {
    q: cleanText(sp.get("q"), SEARCH_MAX),
    status: pick(sp.get("status"), STATUS_KEYS, "all"),
    mapping: pick(sp.get("mapping"), MAPPING_KEYS, "all"),
    city: cleanText(sp.get("city"), 80),
    sort: pick(sp.get("sort"), SORT_KEYS, "updated"),
    page: Number.isInteger(page) && page >= 1 ? Math.min(MAX_PAGE, page) : 1,
  };
}
export function toListParams(s: SupplierListState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.status !== "all") p.set("status", s.status);
  if (s.mapping !== "all") p.set("mapping", s.mapping);
  if (s.city) p.set("city", s.city);
  if (s.sort !== "updated") p.set("sort", s.sort);
  if (s.page > 1) p.set("page", String(s.page));
  return p;
}
/** Strict validation for the API (an unknown value is a 422, never silently ignored). */
export function validateListState(get: (k: string) => string | null | undefined): { ok: true; state: SupplierListState } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const enumOf = <T extends string>(k: string, allowed: readonly string[], fallback: T): T => {
    const v = get(k);
    if (!v) return fallback;
    if (!allowed.includes(v)) { fields[k] = "Unknown filter value."; return fallback; }
    return v as T;
  };
  const q = cleanText(get("q"), 500);
  if (q.length > SEARCH_MAX) fields.q = `Use at most ${SEARCH_MAX} characters.`;
  const city = cleanText(get("city"), 500);
  if (city.length > 80) fields.city = "Use at most 80 characters.";
  const pageRaw = get("page");
  const page = pageRaw ? Number(pageRaw) : 1;
  if (pageRaw && (!Number.isInteger(page) || page < 1 || page > MAX_PAGE)) fields.page = "Unknown page.";
  const state: SupplierListState = { q, status: enumOf("status", STATUS_KEYS, "all"), mapping: enumOf("mapping", MAPPING_KEYS, "all"), city, sort: enumOf("sort", SORT_KEYS, "updated"), page: fields.page ? 1 : page };
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, state };
}
