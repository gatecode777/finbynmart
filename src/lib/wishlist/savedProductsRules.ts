/**
 * Rules of the buyer's "Saved Products" list. Pure (no database), shared by the API, the page and the node-run unit tests.
 *
 * The saved items are the Page 1-4 era `wishlists` collection (one row per buyer and product, unique); this page adds no second
 * collection. A buyer may keep at most SAVED_CAP products, which also bounds every query and every page build.
 */
export const SAVED_CAP = 500;
export const SEARCH_MAX = 60;
export const PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
export const MAX_PAGE = 100;

export const SAVED_SORTS = [
  { value: "recent", label: "Recently Saved" },
  { value: "oldest", label: "Oldest Saved" },
  { value: "name", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
] as const;
export type SavedSort = (typeof SAVED_SORTS)[number]["value"];

export interface SavedQuery {
  q: string;
  /** A category slug (from the categories of the saved products), or null for all. */
  category: string | null;
  sort: SavedSort;
  page: number;
  limit: number;
}

export type SavedQueryResult = { ok: true; value: SavedQuery } | { ok: false; fields: Record<string, string> };

const str = (v: unknown): string | undefined | null => (v === undefined || v === "" ? undefined : typeof v === "string" ? v : null);

/** Parses and validates every list parameter. Unknown parameters (for example buyerId) are ignored, never read. */
export function parseSavedQuery(p: Record<string, unknown>): SavedQueryResult {
  const fields: Record<string, string> = {};
  const text = (key: string) => {
    const v = str(p[key]);
    if (v === null) fields[key] = "Send a single text value.";
    return v ?? undefined;
  };

  const q = (text("q") ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length > SEARCH_MAX) fields.q = `The search text can be at most ${SEARCH_MAX} characters.`;

  const category = text("category");
  if (category !== undefined && !/^[a-z0-9-]{1,80}$/.test(category)) fields.category = "That category is not valid.";

  const rawSort = text("sort") ?? "recent";
  const sort = SAVED_SORTS.find((s) => s.value === rawSort)?.value;
  if (!sort) fields.sort = "Choose one of: recent, oldest, name, name-desc, price-low, price-high.";

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
  return { ok: true, value: { q, category: category ?? null, sort, page, limit } };
}
