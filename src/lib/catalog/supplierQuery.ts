import { MAX_PAGE_SIZE, normalizeSearchQuery, type FacetOption } from "./listingQuery";

/**
 * Client-safe pieces of the supplier listing (Page 08): the query, the fixed option lists, URL parsing and building.
 * The data work lives in supplierListing.ts (server-only).
 */
export type SupplierSort = "relevance" | "name" | "newest" | "products";

/** Only orders the data supports: no rating, popularity or verified-first (no such data). */
export const SUPPLIER_SORT_OPTIONS: { value: SupplierSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "name", label: "Company name A–Z" },
  { value: "newest", label: "Newest members" },
  { value: "products", label: "Most products" },
];

export const SUPPLIER_PAGE_SIZE = 8;

export interface SupplierQuery {
  q: string;
  /** Specialisation of the supplier (the only industry field in the data). */
  industry: string[];
  state: string[];
  city: string[];
  /** Product category ids: suppliers with at least one product in it. */
  category: string[];
  verification: ("verified" | "unverified")[];
  sort: SupplierSort;
  page: number;
  limit?: number;
  view: "grid" | "list";
}

export type { FacetOption };

export function emptySupplierQuery(): SupplierQuery {
  return { q: "", industry: [], state: [], city: [], category: [], verification: [], sort: "relevance", page: 1, view: "grid" };
}

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);
const many = (value: Param) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const clean = (values: string[]) => [...new Set(values.map((v) => v.trim().slice(0, 80)).filter(Boolean))].slice(0, 60);

/** Reads a Next.js searchParams object into a validated query. `specialization` is the old name of `industry`. */
export function parseSupplierQuery(sp: Record<string, Param>): SupplierQuery {
  const sort = first(sp.sort);
  const page = Number(first(sp.page));
  const limit = Number(first(sp.limit));
  return {
    q: normalizeSearchQuery(first(sp.q)),
    industry: clean([...many(sp.industry), ...many(sp.specialization)]),
    state: clean(many(sp.state)),
    city: clean(many(sp.city)),
    category: clean(many(sp.category)),
    verification: clean(many(sp.verification)).filter((v): v is "verified" | "unverified" => v === "verified" || v === "unverified"),
    sort: SUPPLIER_SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SupplierSort) : "relevance",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: Number.isInteger(limit) && limit >= 1 ? Math.min(limit, MAX_PAGE_SIZE) : undefined,
    view: first(sp.view) === "list" ? "list" : "grid",
  };
}

export function supplierParams(query: SupplierQuery, overrides: Partial<SupplierQuery> = {}): [string, string][] {
  const q = { ...query, ...overrides };
  const out: [string, string][] = [];
  if (q.q) out.push(["q", q.q]);
  for (const v of q.industry) out.push(["industry", v]);
  for (const v of q.state) out.push(["state", v]);
  for (const v of q.city) out.push(["city", v]);
  for (const v of q.category) out.push(["category", v]);
  for (const v of q.verification) out.push(["verification", v]);
  if (q.sort !== "relevance") out.push(["sort", q.sort]);
  if (q.view === "list") out.push(["view", "list"]);
  if (q.limit !== undefined) out.push(["limit", String(q.limit)]);
  if (q.page > 1) out.push(["page", String(q.page)]);
  return out;
}

export function supplierHref(basePath: string, query: SupplierQuery, overrides: Partial<SupplierQuery> = {}): string {
  const qs = new URLSearchParams(supplierParams(query, overrides)).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** The filters (not the search text, sort or view) cleared; used by "Clear All". */
export const NO_SUPPLIER_FILTERS: Partial<SupplierQuery> = { industry: [], state: [], city: [], category: [], verification: [], page: 1 };
