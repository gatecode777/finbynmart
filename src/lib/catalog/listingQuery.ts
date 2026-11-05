/**
 * Client-safe pieces of the product listing: query types, the fixed option lists, URL parsing and
 * URL building. No server imports here, so Client Components may use it. The data work itself lives
 * in categoryListing.ts (server-only).
 *
 * One query shape serves every listing: /products (Page 05), /categories/<slug> (Page 03),
 * /categories/<slug>/<sub> (Page 04), /search (Page 07) and GET /api/public/products.
 */

export type ListingSort = "relevance" | "price-asc" | "price-desc";
export type MoqBucket = "1-10" | "11-50" | "51-100" | "100+";

/** Only orders the data can support: there is no creation date and no popularity data. */
export const SORT_OPTIONS: { value: ListingSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

export const MOQ_BUCKETS: { value: MoqBucket; min: number; max?: number; label: string }[] = [
  { value: "1-10", min: 1, max: 10, label: "1 – 10" },
  { value: "11-50", min: 11, max: 50, label: "11 – 50" },
  { value: "51-100", min: 51, max: 100, label: "51 – 100" },
  { value: "100+", min: 101, label: "Above 100" },
];

/** Category pages show 20 per page; the All Products and search pages show 10 (the page PRD). */
export const PAGE_SIZE = 20;
export const PRODUCTS_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;
export const MAX_QUERY_LENGTH = 100;

export interface ListingQuery {
  /** Search text, already normalised (see normalizeSearchQuery). */
  q: string;
  /** Main category ids (all-products scope). */
  category: string[];
  sub: string[];
  /** Catalog departments (Men, Women, ...). Reached from the category directory links. */
  department: string[];
  type: string[];
  state: string[];
  city: string[];
  colour: string[];
  /** One supplier, by public slug. */
  seller: string;
  /** "<unit>:<bucket>", e.g. "piece:11-50". Units are never compared with each other. */
  moq: string;
  /** Unit-aware MOQ range (API): requires moqUnit. */
  moqUnit: string;
  minMoq?: number;
  maxMoq?: number;
  minPrice?: number;
  maxPrice?: number;
  sort: ListingSort;
  page: number;
  /** Explicit page size; undefined means the page's default. Never above MAX_PAGE_SIZE. */
  limit?: number;
  view: "grid" | "list";
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export function emptyListingQuery(): ListingQuery {
  return {
    q: "",
    category: [],
    sub: [],
    department: [],
    type: [],
    state: [],
    city: [],
    colour: [],
    seller: "",
    moq: "",
    moqUnit: "",
    sort: "relevance",
    page: 1,
    view: "grid",
  };
}

/** Trims, strips control characters, collapses whitespace and caps the length. Not a string gives "". */
export function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

// ---------- units (MOQ is only ever compared within one unit) ----------

const UNIT_ALIASES: Record<string, string> = {
  pieces: "piece",
  pcs: "piece",
  pc: "piece",
  boxes: "box",
  rolls: "roll",
  meters: "meter",
  metres: "meter",
  metre: "meter",
  kgs: "kg",
  kilograms: "kg",
  kilogram: "kg",
  units: "unit",
  sets: "set",
  pairs: "pair",
  tons: "ton",
  tonnes: "ton",
  tonne: "ton",
  bags: "bag",
  liters: "liter",
  litres: "liter",
  litre: "liter",
};

/** "Pieces", "Piece" and "pcs" are one unit; "Kg" and "Boxes" are others. */
export function unitKey(unit: string): string {
  const key = unit.trim().toLowerCase().replace(/[^a-z]/g, "");
  return UNIT_ALIASES[key] ?? key;
}

/** Unit as a person would write it next to a quantity. */
export function unitLabel(key: string, quantity = 2): string {
  if (quantity === 1 || key === "kg") return key;
  return key.endsWith("x") ? `${key}es` : `${key}s`;
}

export function moqBucketOf(quantity: number | undefined): MoqBucket | undefined {
  if (quantity === undefined) return undefined;
  return MOQ_BUCKETS.find((bucket) => quantity >= bucket.min && (bucket.max === undefined || quantity <= bucket.max))?.value;
}

/** "piece:11-50" gives "11 – 50 pieces". Unknown shapes fall back to the raw text. */
export function describeMoq(value: string): string {
  const [unit, bucket] = value.split(":");
  const found = MOQ_BUCKETS.find((b) => b.value === bucket);
  return unit && found ? `${found.label} ${unitLabel(unit)}` : value;
}

const MOQ_VALUE = /^[a-z]{1,20}:(1-10|11-50|51-100|100\+)$/;

// ---------- URL parsing and building ----------

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);
const many = (value: Param) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const clean = (values: string[]) => [...new Set(values.map((v) => v.trim().slice(0, 80)).filter(Boolean))].slice(0, 60);
const nonNegative = (value: Param) => {
  const raw = first(value);
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Reads a Next.js searchParams object into a validated query. Unknown or malformed values fall back to defaults. */
export function parseListingQuery(sp: Record<string, Param>): ListingQuery {
  const sort = first(sp.sort);
  const moq = first(sp.moq);
  const page = Number(first(sp.page));
  const limit = Number(first(sp.limit));
  const seller = (first(sp.seller) ?? "").trim().toLowerCase();
  const moqUnit = unitKey(first(sp.moqUnit) ?? "");

  return {
    q: normalizeSearchQuery(first(sp.q)),
    category: clean(many(sp.category)),
    sub: clean(many(sp.sub)),
    department: clean(many(sp.department)),
    type: clean(many(sp.type)),
    state: clean(many(sp.state)),
    city: clean(many(sp.city)),
    colour: clean(many(sp.colour)),
    seller: /^[a-z0-9-]{1,80}$/.test(seller) ? seller : "",
    moq: moq && MOQ_VALUE.test(moq) ? moq : "",
    moqUnit,
    minMoq: nonNegative(sp.minMoq),
    maxMoq: nonNegative(sp.maxMoq),
    minPrice: nonNegative(sp.minPrice),
    maxPrice: nonNegative(sp.maxPrice),
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as ListingSort) : "relevance",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: Number.isInteger(limit) && limit >= 1 ? Math.min(limit, MAX_PAGE_SIZE) : undefined,
    view: first(sp.view) === "list" ? "list" : "grid",
  };
}

/** The URL parameters of a query as ordered name/value pairs, defaults dropped. `overrides` replaces fields. */
export function listingParams(query: ListingQuery, overrides: Partial<ListingQuery> = {}): [string, string][] {
  const q = { ...query, ...overrides };
  const out: [string, string][] = [];
  if (q.q) out.push(["q", q.q]);
  for (const v of q.category) out.push(["category", v]);
  for (const v of q.sub) out.push(["sub", v]);
  for (const v of q.department) out.push(["department", v]);
  for (const v of q.type) out.push(["type", v]);
  for (const v of q.state) out.push(["state", v]);
  for (const v of q.city) out.push(["city", v]);
  for (const v of q.colour) out.push(["colour", v]);
  if (q.seller) out.push(["seller", q.seller]);
  if (q.moq) out.push(["moq", q.moq]);
  if (q.moqUnit) out.push(["moqUnit", q.moqUnit]);
  if (q.minMoq !== undefined) out.push(["minMoq", String(q.minMoq)]);
  if (q.maxMoq !== undefined) out.push(["maxMoq", String(q.maxMoq)]);
  if (q.minPrice !== undefined) out.push(["minPrice", String(q.minPrice)]);
  if (q.maxPrice !== undefined) out.push(["maxPrice", String(q.maxPrice)]);
  if (q.sort !== "relevance") out.push(["sort", q.sort]);
  if (q.view === "list") out.push(["view", "list"]);
  if (q.limit !== undefined) out.push(["limit", String(q.limit)]);
  if (q.page > 1) out.push(["page", String(q.page)]);
  return out;
}

/** Builds a URL under `basePath` (e.g. /products) for a query, dropping defaults. `overrides` replaces fields. */
export function listingHref(basePath: string, query: ListingQuery, overrides: Partial<ListingQuery> = {}): string {
  const qs = new URLSearchParams(listingParams(query, overrides)).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** The filters (not the search text, sort or view) cleared; used by "Clear All". */
export const NO_FILTERS: Partial<ListingQuery> = {
  category: [],
  sub: [],
  department: [],
  type: [],
  state: [],
  city: [],
  colour: [],
  seller: "",
  moq: "",
  moqUnit: "",
  minMoq: undefined,
  maxMoq: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  page: 1,
};
