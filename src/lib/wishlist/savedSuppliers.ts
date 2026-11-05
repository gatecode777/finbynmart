import { getCatalog } from "@/lib/catalog/data";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { initials, slugify } from "@/lib/catalog/slug";
import { COMPARE_MAX, COMPARE_MIN, type SavedSupplierQuery } from "./savedSuppliersRules";
import { listSavedSupplierRows } from "./supplierService";

/**
 * The buyer's saved suppliers for the Saved Suppliers page. The rows are the existing `wishlist_suppliers` collection (nothing is
 * copied into it); supplier details are read LIVE from the catalogue for the saved keys only, at most SAVED_SUPPLIER_CAP, never the
 * whole catalogue. Every query names the buyer from the session. Contact fields are never loaded.
 *
 * What a supplier record can honestly say: name, city and state (no country), supplier type (sample suppliers only), a description
 * (only the hand-written sample profile has one), product and category counts, a member-since year, and "verified" only where the
 * supplier's own record says so (catalogue sellers never are). There are no logos, banners, ratings, reviews, response statistics or
 * verification workflow states in the data, so none is shown or sortable.
 *
 * A saved supplier that has since left the catalogue is NOT dropped silently: it is listed as unavailable with the name it was saved
 * under, offers no contact action, and can be removed.
 */
export interface SavedSupplierItem {
  key: string;
  savedAt: string;
  available: boolean;
  name: string;
  initials: string;
  url: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  categories: { id: string; name: string }[];
  /** All distinct product categories, not only the ones listed. */
  categoryCount: number | null;
  supplierType: string | null;
  verified: boolean;
  productCount: number | null;
  memberSince: string | null;
  description: string | null;
  inquiryHref: string | null;
  productsHref: string | null;
}

export interface SavedSuppliersPage {
  items: SavedSupplierItem[];
  /** Everything the buyer has saved, whatever the filters. */
  totalSaved: number;
  /** Suppliers matching the current search and filters. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Facts {
  available: boolean;
  name: string;
  initials: string;
  url: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  categories: { id: string; name: string }[];
  categoryCount: number | null;
  supplierType: string | null;
  verified: boolean;
  productCount: number | null;
  memberSince: string | null;
  description: string | null;
  inquiryHref: string | null;
  productsHref: string | null;
}

// The catalogue is a read-only seed (CSV and constants) that never changes while the server runs, so the facts of a supplier are
// computed once per key. The memo holds at most one entry per supplier of the catalogue, never anything per buyer.
const memo = new Map<string, Facts | null>();

function computeFacts(key: string): Facts | null {
  const catalog = getCatalog();
  const seller = catalog.sellerById.get(key);
  if (seller) {
    const products = catalog.productsBySeller.get(seller.id) ?? [];
    const perCategory = new Map<string, number>();
    for (const p of products) perCategory.set(p.categoryName, (perCategory.get(p.categoryName) ?? 0) + 1);
    const categories = [...perCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => ({ id: slugify(name), name }));
    return {
      available: true, name: seller.name, initials: initials(seller.name), url: `/suppliers/${seller.slug}`, city: seller.city || null, state: seller.state || null,
      location: [seller.city, seller.state].filter(Boolean).join(", ") || null, categories, categoryCount: categories.length, supplierType: null, verified: false,
      productCount: products.length, memberSince: seller.joinedDate.slice(0, 4), description: null, inquiryHref: `/inquiry/${seller.slug}`, productsHref: `/suppliers/${seller.slug}/products`,
    };
  }
  const sample = getPublicSupplierBySlug(key);
  if (!sample) return null;
  return {
    available: true, name: sample.name, initials: sample.initials, url: sample.url, city: sample.city || null, state: sample.state || null,
    location: [sample.city, sample.state].filter(Boolean).join(", ") || null, categories: sample.categories.map((name) => ({ id: slugify(name), name })), categoryCount: sample.categoryCount,
    supplierType: sample.supplierType, verified: sample.verificationStatus === "verified", productCount: sample.productCount, memberSince: sample.memberSince, description: sample.description,
    inquiryHref: `/inquiry/${sample.slug}`, productsHref: sample.productsUrl,
  };
}

function factsOf(key: string): Facts | null {
  if (!memo.has(key)) memo.set(key, computeFacts(key));
  return memo.get(key) ?? null;
}

interface Row extends SavedSupplierItem {
  sortName: string;
  savedMs: number;
  searchText: string;
  typeId: string;
  stateId: string | null;
  cityId: string | null;
}

function toRow(key: string, savedName: string, savedAt: Date): Row {
  const f = factsOf(key);
  const base = { key, savedAt: savedAt.toISOString(), savedMs: savedAt.getTime() };
  if (!f) {
    return { ...base, available: false, name: savedName, initials: initials(savedName), url: null, city: null, state: null, location: null, categories: [], categoryCount: null, supplierType: null, verified: false, productCount: null, memberSince: null, description: null, inquiryHref: null, productsHref: null, sortName: savedName.toLowerCase(), searchText: savedName.toLowerCase(), typeId: "not-specified", stateId: null, cityId: null };
  }
  return {
    ...base, ...f,
    sortName: f.name.toLowerCase(),
    searchText: `${f.name} ${f.city ?? ""} ${f.state ?? ""} ${f.categories.map((c) => c.name).join(" ")} ${f.supplierType ?? ""} ${f.description ?? ""}`.toLowerCase(),
    typeId: f.supplierType ? slugify(f.supplierType) : "not-specified",
    stateId: f.state ? slugify(f.state) : null,
    cityId: f.city ? slugify(f.city) : null,
  };
}

async function loadRows(userId: string): Promise<Row[]> {
  const rows = await listSavedSupplierRows(userId);
  return rows.map((r) => toRow(r.supplierKey, r.supplierName, r.addedAt));
}

const bySort: Record<SavedSupplierQuery["sort"], (a: Row, b: Row) => number> = {
  recent: (a, b) => b.savedMs - a.savedMs || b.key.localeCompare(a.key),
  oldest: (a, b) => a.savedMs - b.savedMs || a.key.localeCompare(b.key),
  name: (a, b) => a.sortName.localeCompare(b.sortName) || a.key.localeCompare(b.key),
  "name-desc": (a, b) => b.sortName.localeCompare(a.sortName) || a.key.localeCompare(b.key),
  // suppliers with no count (unavailable) go last either way
  products: (a, b) => (b.productCount ?? -1) - (a.productCount ?? -1) || a.sortName.localeCompare(b.sortName) || a.key.localeCompare(b.key),
  categories: (a, b) => (b.categoryCount ?? -1) - (a.categoryCount ?? -1) || a.sortName.localeCompare(b.sortName) || a.key.localeCompare(b.key),
};

function matches(row: Row, q: SavedSupplierQuery, needle: string): boolean {
  if (needle && !row.searchText.includes(needle)) return false;
  if (q.category && !row.categories.some((c) => c.id === q.category)) return false;
  if (q.state && row.stateId !== q.state) return false;
  if (q.city && row.cityId !== q.city) return false;
  if (q.type && row.typeId !== q.type) return false;
  if (q.verification === "verified" && !row.verified) return false;
  if (q.verification === "unverified" && (row.verified || !row.available)) return false;
  return true;
}

const strip = ({ sortName, savedMs, searchText, typeId, stateId, cityId, ...item }: Row): SavedSupplierItem => {
  void sortName; void savedMs; void searchText; void typeId; void stateId; void cityId;
  return item;
};

export async function listSavedSuppliersPage(userId: string, query: SavedSupplierQuery): Promise<SavedSuppliersPage> {
  const all = await loadRows(userId);
  const needle = query.q.toLowerCase();
  const filtered = all.filter((r) => matches(r, query, needle)).sort(bySort[query.sort]);
  const start = (query.page - 1) * query.limit;
  return { items: filtered.slice(start, start + query.limit).map(strip), totalSaved: all.length, total: filtered.length, page: query.page, limit: query.limit, totalPages: Math.ceil(filtered.length / query.limit) };
}

// ---------- summary and filter choices ----------
export interface SavedSuppliersSummary {
  totalSaved: number;
  verified: number;
  active: number;
  categories: number;
  states: number;
}

export interface SavedSupplierFacets {
  categories: { id: string; name: string; count: number }[];
  states: { id: string; name: string; count: number }[];
  cities: { id: string; name: string; stateId: string | null; count: number }[];
  types: { id: string; name: string; count: number }[];
  verification: { verified: number; unverified: number };
}

const bump = <T extends { count: number }>(map: Map<string, T>, id: string, make: () => T) => {
  const e = map.get(id) ?? make();
  e.count += 1;
  map.set(id, e);
};
const ordered = <T extends { name: string; count: number }>(map: Map<string, T>, limit: number) => [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);

/** The five numbers over ALL of the buyer's saved suppliers, and the choices of the filters (from what they really saved). */
export async function getSavedSuppliersSummary(userId: string): Promise<{ summary: SavedSuppliersSummary; facets: SavedSupplierFacets }> {
  const all = await loadRows(userId);
  const live = all.filter((r) => r.available);
  const categories = new Map<string, { id: string; name: string; count: number }>();
  const states = new Map<string, { id: string; name: string; count: number }>();
  const cities = new Map<string, { id: string; name: string; stateId: string | null; count: number }>();
  const types = new Map<string, { id: string; name: string; count: number }>();
  for (const r of live) {
    for (const c of r.categories) bump(categories, c.id, () => ({ id: c.id, name: c.name, count: 0 }));
    if (r.state && r.stateId) bump(states, r.stateId, () => ({ id: r.stateId!, name: r.state!, count: 0 }));
    if (r.city && r.cityId) bump(cities, `${r.stateId}/${r.cityId}`, () => ({ id: r.cityId!, name: r.city!, stateId: r.stateId, count: 0 }));
    bump(types, r.typeId, () => ({ id: r.typeId, name: r.supplierType ?? "Not specified", count: 0 }));
  }
  const verified = live.filter((r) => r.verified).length;
  return {
    summary: { totalSaved: all.length, verified, active: live.length, categories: categories.size, states: states.size },
    facets: { categories: ordered(categories, 60), states: ordered(states, 40), cities: ordered(cities, 100), types: ordered(types, 12), verification: { verified, unverified: live.length - verified } },
  };
}

// ---------- comparison ----------
export interface SupplierComparison {
  columns: { key: string; name: string; url: string | null; inquiryHref: string | null; values: Record<string, string | null> }[];
  fields: { key: string; label: string; differs: boolean }[];
  min: number;
  max: number;
}

export type ComparisonOutcome = { ok: true; value: SupplierComparison } | { ok: false; code: "COUNT" | "NOT_FOUND"; message: string };

const FIELDS: [string, string][] = [
  ["type", "Business Type"],
  ["verification", "Verification"],
  ["categories", "Main Categories"],
  ["categoryCount", "Product Categories"],
  ["productCount", "Public Products"],
  ["location", "Business Location"],
  ["memberSince", "Member Since"],
];

/**
 * Two to four of the buyer's OWN saved suppliers side by side, from the live catalogue. A key the buyer has not saved, or a supplier
 * that has left the catalogue, makes the whole request "not found" (no hint which). Missing values are null ("Not Provided"). Nothing
 * is scored, ranked or called best, and a verified and an unverified supplier are simply shown as they are.
 */
export async function compareSavedSuppliers(userId: string, keys: string[]): Promise<ComparisonOutcome> {
  const unique = [...new Set(keys)];
  if (unique.length < COMPARE_MIN || unique.length > COMPARE_MAX) return { ok: false, code: "COUNT", message: `Choose between ${COMPARE_MIN} and ${COMPARE_MAX} different suppliers to compare.` };
  const mine = new Map((await loadRows(userId)).map((r) => [r.key, r]));
  const rows = unique.map((k) => mine.get(k));
  if (rows.some((r) => !r || !r.available)) return { ok: false, code: "NOT_FOUND", message: "One or more of these suppliers were not found among your available saved suppliers." };
  const columns = (rows as Row[]).map((r) => ({
    key: r.key,
    name: r.name,
    url: r.url,
    inquiryHref: r.inquiryHref,
    values: {
      type: r.supplierType,
      verification: r.verified ? "Verified" : "Not verified",
      categories: r.categories.length > 0 ? r.categories.slice(0, 3).map((c) => c.name).join(", ") : null,
      categoryCount: r.categoryCount === null ? null : String(r.categoryCount),
      productCount: r.productCount === null ? null : r.productCount.toLocaleString("en-IN"),
      location: r.location,
      memberSince: r.memberSince,
    } as Record<string, string | null>,
  }));
  const fields = FIELDS.map(([key, label]) => ({ key, label, differs: new Set(columns.map((c) => c.values[key] ?? null)).size > 1 }));
  return { ok: true, value: { columns, fields, min: COMPARE_MIN, max: COMPARE_MAX } };
}
