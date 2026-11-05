/**
 * Rules of the buyer's "Saved Suppliers" list. Pure (no database), shared by the API, the page and the node-run unit tests.
 *
 * The saved suppliers are the existing `wishlist_suppliers` collection (one row per buyer and supplier, unique); this page adds no
 * second collection. A buyer may keep at most SAVED_SUPPLIER_CAP suppliers, which also bounds every query and page build.
 *
 * Counting rules (also in docs/backend/PAGE_34_SUPPLIER_COUNT_RULES.md):
 *   Total Saved  every saved relationship of the buyer, including a supplier that has since left the catalogue.
 *   Verified     saved suppliers still in the catalogue whose own record says "verified". Catalogue sellers never are; no e-mail,
 *                phone, GSTIN, logo or complete profile ever counts.
 *   Active       saved suppliers still in the catalogue (publicly listed, so they can be viewed and contacted).
 *   Categories   distinct product categories of the active saved suppliers (a supplier in two categories adds two, a category shared
 *                by two suppliers counts once).
 *   States       distinct states of the active saved suppliers. There is NO country field in any supplier record, and a country is
 *                never inferred from a name or a phone number, so the PRD's "Countries" card is shown as States.
 */
export const SAVED_SUPPLIER_CAP = 500;
export const SEARCH_MAX = 60;
export const PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
export const MAX_PAGE = 100;
/** Selection, bulk removal and comparison are bounded. */
export const BULK_MAX = 20;
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export const SUPPLIER_SORTS = [
  { value: "recent", label: "Recently Saved" },
  { value: "oldest", label: "Oldest Saved" },
  { value: "name", label: "Company Name A-Z" },
  { value: "name-desc", label: "Company Name Z-A" },
  { value: "products", label: "Most Products" },
  { value: "categories", label: "Most Categories" },
] as const;
// "Highest Rating" is not offered: no supplier has genuine reviews or ratings, and the sample ratings in the research data are not feedback.
export type SupplierSort = (typeof SUPPLIER_SORTS)[number]["value"];

export const VERIFICATION_FILTERS = [
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Not verified" },
] as const;
// "Pending" and "Rejected" are not offered: there is no verification workflow, so no supplier can be in either state.

export interface SavedSupplierQuery {
  q: string;
  /** A category slug (any category of the supplier counts), or null for all. */
  category: string | null;
  /** A state slug, or null for all. */
  state: string | null;
  /** A city slug, or null for all. */
  city: string | null;
  /** A supplier type slug, "not-specified" for suppliers whose record has none, or null for all. */
  type: string | null;
  verification: "verified" | "unverified" | null;
  sort: SupplierSort;
  page: number;
  limit: number;
}

export type SavedSupplierQueryResult = { ok: true; value: SavedSupplierQuery } | { ok: false; fields: Record<string, string> };

const str = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

/** Parses and validates every list parameter. Unknown parameters (for example buyerId) are ignored, never read. */
export function parseSavedSupplierQuery(p: Record<string, unknown>): SavedSupplierQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = str(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };
  const slug = (key: string) => {
    const v = text(key);
    if (v !== undefined && !/^[a-z0-9-]{1,80}$/.test(v)) fields[key] = `That ${key} is not valid.`;
    return v;
  };

  const q = (text("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;

  const category = slug("category");
  const state = slug("state");
  const city = slug("city");
  const type = slug("type");

  const rawVerification = text("verification");
  const verification = VERIFICATION_FILTERS.find((v) => v.value === rawVerification)?.value;
  if (rawVerification !== undefined && !verification) fields.verification = "Choose verified or unverified.";

  const rawSort = text("sort") ?? "recent";
  const sort = SUPPLIER_SORTS.find((s) => s.value === rawSort)?.value;
  if (!sort) fields.sort = `Choose one of: ${SUPPLIER_SORTS.map((s) => s.value).join(", ")}.`;

  const num = (key: string, fallback: number, max: number) => {
    const v = p[key];
    if (v === undefined || v === "") return fallback;
    const n = typeof v === "string" ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > max) {
      fields[key] = `${key} must be a whole number from 1 to ${max}.`;
      return fallback;
    }
    return n;
  };
  const page = num("page", 1, MAX_PAGE);
  const limit = num("limit", PAGE_SIZE, MAX_PAGE_SIZE);

  if (Object.keys(fields).length > 0 || !sort) return { ok: false, fields };
  return { ok: true, value: { q, category: category ?? null, state: state ?? null, city: city ?? null, type: type ?? null, verification: verification ?? null, sort, page, limit } };
}

export type KeysResult = { ok: true; keys: string[] } | { ok: false; message: string };

/** A bounded, de-duplicated list of stored supplier keys from a request body. */
export function parseSupplierKeys(value: unknown, min = 1, max = BULK_MAX): KeysResult {
  if (!Array.isArray(value)) return { ok: false, message: "Send a list of suppliers." };
  const keys = [...new Set(value)];
  if (keys.length < min) return { ok: false, message: min === 1 ? "Choose at least one supplier." : `Choose at least ${min} different suppliers.` };
  if (keys.length > max) return { ok: false, message: `Choose at most ${max} suppliers at a time.` };
  if (!keys.every((k) => typeof k === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(k))) return { ok: false, message: "One of the suppliers is not valid." };
  return { ok: true, keys: keys as string[] };
}
