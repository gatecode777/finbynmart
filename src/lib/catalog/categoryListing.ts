import { CATEGORY_PAGES, getCategoryPage } from "@/lib/constants/categoryPages";
import type { B2BProduct, CatalogProduct, ProductCardData } from "@/types";
import { canonicalCategorySlug, getCategoryDirectory, getCategoryRecord, type CategoryRecord } from "./categories";
import { addStage, markCache } from "@/lib/perf/context";
import { createLruCache, ttlSetting } from "@/lib/perf/ttlCache";
import { getCatalog, adoptedSeller } from "./data";
import { toProductCard } from "./mappers";
import { searchText, searchTokens, slugify } from "./slug";
import {
  MAX_PAGE_SIZE,
  MOQ_BUCKETS,
  PAGE_SIZE,
  describeMoq,
  moqBucketOf,
  normalizeSearchQuery,
  unitKey,
  type FacetOption,
  type ListingQuery,
} from "./listingQuery";

export * from "./listingQuery";

export interface ListingItemMeta {
  source: "catalog" | "sample";
  category: { id: string; name: string };
  subcategory: { id: string; name: string };
  department?: string;
  colour?: string;
  supplierKey: string;
  supplierSlug: string;
  supplierType?: string;
  verified: boolean;
}

export interface ListingItem {
  card: ProductCardData;
  meta: ListingItemMeta;
}

/** A filter value in the request that is not a known category, subcategory, department or supplier. It is ignored. */
export interface IgnoredFilter {
  param: string;
  value: string;
}

export interface CategoryListing {
  /** Set when the listing is scoped to one category (Pages 03 and 04); absent for all products. */
  record?: CategoryRecord;
  totals: { products: number; suppliers: number; verifiedSuppliers: number | null; subcategories: number; categories: number };
  /** Popular subcategories (by product count), independent of the current filters. Empty for all products. */
  chips: FacetOption[];
  facets: {
    categories: FacetOption[];
    subcategories: FacetOption[];
    supplierTypes: FacetOption[] | null;
    moq: FacetOption[] | null;
    locations: FacetOption[];
    cities: FacetOption[];
    colours: FacetOption[] | null;
    price: { min: number; max: number } | null;
  };
  results: {
    products: ProductCardData[];
    items: ListingItem[];
    total: number;
    page: number;
    totalPages: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  /** About the search text alone, before any sidebar filter (only when there is search text). */
  search?: {
    products: number;
    suppliers: number;
    categories: number;
    /** Subcategories of the matching products, most products first: the source of related searches. */
    subcategories: FacetOption[];
  };
  /** Number of active filters, for the badge and the "Clear All" state. The search text is not counted. */
  activeFilters: number;
  /** The query that was actually applied (unknown ids removed, page size resolved). */
  applied: ListingQuery;
  ignored: IgnoredFilter[];
}

/**
 * Server-only. The one product listing engine of the site: search, filtering, faceting, sorting and
 * pagination happen here, and only the visible page is turned into card data and sent to the browser.
 * Never the whole catalog. Pages 03, 04, 05 and 07 and GET /api/public/products all call it.
 *
 * Two real sources back it:
 *  - Apparel & Fashion: the product catalog (db/seed). It has category, an estimated price, colour and
 *    the seller's city and state. It has NO MOQ, supplier type, brand, rating or verification, so those
 *    filters and badges only ever apply to products that carry them.
 *  - The other categories: sample B2B listings (categoryPages.ts) with supplier type, MOQ, rating and
 *    location, but no brand.
 * A filter group is offered only when some record in scope carries the attribute. A product without the
 * attribute never matches a filter on it (for example, a product with no MOQ is not "MOQ 0").
 * There is no brand, availability or creation-date field anywhere in the data, so those are absent.
 *
 * Search: text is normalised like the dataset ("t-shirt" -> "tshirt"), split into words and every word
 * must match (AND). Words of up to three letters must start a word, so "men" does not match "women";
 * longer words match anywhere in the name, category or colour, so "shirt" finds "tshirt". There is no
 * regular expression and no database query: matching is plain substring tests over a precomputed,
 * lower-cased text per product, bounded by MAX_QUERY_LENGTH and 8 words.
 *
 * Relevance (search text present): per word, an exact name word scores 6, a name word that starts with
 * it 4, a match inside the name 3, a match only in category or colour 1; the whole phrase at the start of
 * the name adds 5, anywhere in the name 2. Ties keep the source order. Without search text, relevance is
 * the source order (categories in directory order, then catalog order); it makes no popularity claim.
 *
 * Facet counts: each group is counted with every other filter and the search applied, but not its own,
 * so an option never reads 0 only because it is ticked. A ticked option stays listed even at 0.
 */

interface Row {
  /** Index into the category's source array. */
  i: number;
  cat: string;
  sub: string;
  department?: string;
  name: string;
  nameNorm: string;
  words: string[];
  /** Normalised text the search runs over: name, category, subcategory, colour, department. */
  hay: string;
  price: number;
  priceHi: number;
  state: string;
  city: string;
  type?: string;
  colour?: string;
  moq?: number;
  /** Normalised unit key ("piece", "box", "kg"). */
  moqUnit?: string;
  supplier: string;
  supplierSlug: string;
  verified: boolean;
  /** Where this row's product comes from, when it differs from what its category says (a supplier's mixed list). */
  src?: Source;
}

interface Source {
  kind: "catalog" | "sample";
  catalog?: CatalogProduct[];
  sample?: B2BProduct[];
}

interface Index {
  source: "catalog" | "sample" | "mixed";
  rows: Row[];
  sources: Map<string, Source>;
  catNames: Map<string, string>;
  subLabels: Map<string, string>;
  /** Parent grouping of a subcategory (the catalog department), used to find siblings. */
  subGroup: Map<string, string>;
  /** Main category of each subcategory (for suggestion links). */
  subCat: Map<string, string>;
  departments: Set<string>;
  sellerSlugs: Set<string>;
  /** Single-source indexes only (getSubcategoryInfo). */
  catalog?: CatalogProduct[];
  sample?: B2BProduct[];
  supportsType: boolean;
  supportsMoq: boolean;
  supportsColour: boolean;
}

const MAX_WORDS = 8;
const ALL = "*";
const globalForListing = globalThis as unknown as { __finbynListingIndexesV2?: Map<string, Index> };

const wordsOf = (norm: string) => norm.split(/[^a-z0-9]+/).filter(Boolean);

function buildIndex(record: CategoryRecord): Index {
  if (record.source === "catalog") {
    const { products, sellerById } = getCatalog();
    const subLabels = new Map<string, string>();
    const subGroup = new Map<string, string>();
    const departments = new Set<string>();
    const sellerSlugs = new Set<string>();
    const rows: Row[] = products.map((p, i) => {
      const sub = slugify(p.categoryName);
      if (!subLabels.has(sub)) {
        subLabels.set(sub, p.categoryName);
        subGroup.set(sub, p.department);
      }
      departments.add(p.department);
      const seller = sellerById.get(p.sellerId);
      if (seller) sellerSlugs.add(seller.slug);
      const nameNorm = searchText(p.name);
      return {
        i,
        cat: record.id,
        sub,
        department: p.department,
        name: p.name,
        nameNorm,
        words: wordsOf(nameNorm),
        hay: searchText(`${p.name} ${p.categoryName} ${p.colour} ${p.department} ${record.name}`),
        price: p.estimatedPriceInr,
        priceHi: p.estimatedPriceInr,
        state: seller?.state ?? "",
        city: seller?.city ?? "",
        colour: p.colour || undefined,
        supplier: p.sellerId,
        supplierSlug: seller?.slug ?? "",
        verified: false,
      };
    });
    return {
      source: "catalog",
      rows,
      sources: new Map([[record.id, { kind: "catalog", catalog: products }]]),
      catNames: new Map([[record.id, record.name]]),
      subLabels,
      subGroup,
      subCat: new Map([...subLabels.keys()].map((id) => [id, record.id])),
      departments,
      sellerSlugs,
      catalog: products,
      supportsType: false,
      supportsMoq: false,
      supportsColour: true,
    };
  }

  const page = record.samplePageSlug ? getCategoryPage(record.samplePageSlug) : undefined;
  const sample = page?.products ?? [];
  const subLabels = new Map((page?.subcategories ?? []).map((s) => [s.id, s.name]));
  const sellerSlugs = new Set<string>();
  const rows: Row[] = sample.map((p, i) => {
    const supplierSlug = p.supplierHref.replace(/^\/suppliers\//, "");
    sellerSlugs.add(supplierSlug);
    const nameNorm = searchText(p.name);
    return {
      i,
      cat: record.id,
      sub: p.subcategoryId,
      name: p.name,
      nameNorm,
      words: wordsOf(nameNorm),
      hay: searchText(`${p.name} ${subLabels.get(p.subcategoryId) ?? ""} ${record.name}`),
      price: p.priceMin,
      priceHi: p.priceMax ?? p.priceMin,
      state: p.supplierState,
      city: p.supplierCity,
      type: p.supplierType,
      moq: p.moq,
      moqUnit: p.moqUnit ? unitKey(p.moqUnit) : undefined,
      supplier: p.supplierHref,
      supplierSlug,
      verified: p.verified,
    };
  });
  return {
    source: "sample",
    rows,
    sources: new Map([[record.id, { kind: "sample", sample }]]),
    catNames: new Map([[record.id, record.name]]),
    subLabels,
    subGroup: new Map(),
    subCat: new Map([...subLabels.keys()].map((id) => [id, record.id])),
    departments: new Set(),
    sellerSlugs,
    sample,
    supportsType: rows.some((r) => r.type),
    supportsMoq: rows.some((r) => r.moq !== undefined && r.moqUnit),
    supportsColour: false,
  };
}

/** Every discoverable main category in one index, so All Products and search read the same engine. */
function buildAll(): Index {
  const mains = getCategoryDirectory().nodes.filter((node) => node.parentId === null);
  const parts = mains.map((node) => indexFor(node.id)).filter((part): part is Index => Boolean(part));
  const merged: Index = {
    source: "mixed",
    rows: [],
    sources: new Map(),
    catNames: new Map(),
    subLabels: new Map(),
    subGroup: new Map(),
    subCat: new Map(),
    departments: new Set(),
    sellerSlugs: new Set(),
    supportsType: false,
    supportsMoq: false,
    supportsColour: false,
  };
  for (const part of parts) {
    for (const row of part.rows) merged.rows.push(row);
    for (const [id, source] of part.sources) merged.sources.set(id, source);
    for (const [id, name] of part.catNames) merged.catNames.set(id, name);
    for (const [id, label] of part.subLabels) {
      if (merged.subLabels.has(id) && merged.subLabels.get(id) !== label) console.warn(`catalog: subcategory id "${id}" is used by two categories`);
      merged.subLabels.set(id, label);
    }
    for (const [id, group] of part.subGroup) merged.subGroup.set(id, group);
    for (const [id, cat] of part.subCat) merged.subCat.set(id, cat);
    for (const department of part.departments) merged.departments.add(department);
    for (const slug of part.sellerSlugs) merged.sellerSlugs.add(slug);
    merged.supportsType ||= part.supportsType;
    merged.supportsMoq ||= part.supportsMoq;
    merged.supportsColour ||= part.supportsColour;
  }
  return merged;
}

function indexFor(id: string): Index | undefined {
  const cache = (globalForListing.__finbynListingIndexesV2 ??= new Map());
  let index = cache.get(id);
  if (!index) {
    if (id === ALL) {
      index = buildAll();
    } else {
      const record = getCategoryRecord(id);
      if (!record) return undefined;
      index = buildIndex(record);
    }
    cache.set(id, index);
  }
  return index;
}

type Skip = "category" | "sub" | "type" | "state" | "city" | "moq" | "colour";

interface BuildOptions {
  record?: CategoryRecord;
  /** Lock the listing to one subcategory (Page 04). Its own subcategory facet and chips are then omitted. */
  sub?: string;
  pageSize?: number;
}

/**
 * A listing is a pure function of the (immutable, in-memory) index, the query and the options, and it costs several passes
 * over every row (search, one per facet group, totals, the result set). The same pages and API calls are asked for again
 * and again (the first page of All Products, a category, a popular search), so finished listings are kept: 300 of them,
 * five minutes each (FINBYN_LISTING_CACHE_MS; 0 switches it off). The cached object is shared and must be treated as
 * read-only, which every caller does. The cache key is the index object's identity plus the full query, so a different
 * filter, sort, page or page size is always a different entry.
 */
const listingCache = createLruCache<CategoryListing>({ name: "catalog.listing", max: 300, ttlMs: ttlSetting("FINBYN_LISTING_CACHE_MS", 300_000) });
const indexIds = new WeakMap<Index, number>();
let nextIndexId = 1;

function build(index: Index, requested: ListingQuery, options: BuildOptions): CategoryListing {
  let id = indexIds.get(index);
  if (id === undefined) indexIds.set(index, (id = nextIndexId++));
  const key = `${id}|${options.record?.id ?? ""}|${options.sub ?? ""}|${options.pageSize ?? ""}|${JSON.stringify(requested)}`;
  const cached = listingCache.get(key);
  if (cached) {
    markCache("hit");
    return cached;
  }
  markCache("miss");
  const t0 = performance.now();
  const result = buildUncached(index, requested, options);
  addStage("engine.build", performance.now() - t0);
  listingCache.set(key, result);
  return result;
}

function buildUncached(index: Index, requested: ListingQuery, options: BuildOptions): CategoryListing {
  const scoped = Boolean(options.record);
  const lockedSub = options.sub;
  const rows = lockedSub ? index.rows.filter((row) => row.sub === lockedSub) : index.rows;

  // Unknown ids are dropped (and reported) instead of silently producing an empty page.
  const ignored: IgnoredFilter[] = [];
  const known = (param: string, values: string[], isKnown: (value: string) => boolean) =>
    values.filter((value) => (isKnown(value) ? true : (ignored.push({ param, value }), false)));
  const query: ListingQuery = {
    ...requested,
    category: scoped ? [] : known("category", requested.category, (v) => index.catNames.has(v)),
    sub: lockedSub ? [] : known("sub", requested.sub, (v) => index.subLabels.has(v)),
    department: known("department", requested.department, (v) => index.departments.has(v)),
    seller: !requested.seller || index.sellerSlugs.has(requested.seller) ? requested.seller : (ignored.push({ param: "seller", value: requested.seller }), ""),
  };

  const words = searchTokens(query.q).slice(0, MAX_WORDS);
  // Search match per row, computed once per request: words of up to three letters must start a word.
  const textMatch: Uint8Array | null = words.length
    ? Uint8Array.from(rows, (row) => (words.every((w) => (w.length <= 3 ? row.hay.startsWith(w) || row.hay.includes(` ${w}`) : row.hay.includes(w))) ? 1 : 0))
    : null;

  // What the search text alone matches, for the results hero and related searches.
  let search: CategoryListing["search"];
  if (textMatch) {
    const found = new Set<string>();
    const foundCats = new Set<string>();
    const foundSubs = new Map<string, number>();
    let count = 0;
    rows.forEach((row, at) => {
      if (!textMatch[at]) return;
      count++;
      found.add(row.supplier);
      foundCats.add(row.cat);
      foundSubs.set(row.sub, (foundSubs.get(row.sub) ?? 0) + 1);
    });
    search = {
      products: count,
      suppliers: found.size,
      categories: foundCats.size,
      subcategories: [...foundSubs.entries()]
        .map(([value, n]) => ({ value, label: index.subLabels.get(value) ?? value, count: n }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    };
  }

  const matches = (row: Row, at: number, skip?: Skip): boolean => {
    if (textMatch && !textMatch[at]) return false;
    if (skip !== "category" && query.category.length && !query.category.includes(row.cat)) return false;
    if (skip !== "sub" && query.sub.length && !query.sub.includes(row.sub)) return false;
    if (query.department.length && !(row.department && query.department.includes(row.department))) return false;
    if (skip !== "type" && query.type.length && !(row.type && query.type.includes(row.type))) return false;
    if (skip !== "state" && query.state.length && !query.state.includes(row.state)) return false;
    if (skip !== "city" && query.city.length && !query.city.includes(row.city)) return false;
    if (skip !== "colour" && query.colour.length && !(row.colour && query.colour.includes(row.colour))) return false;
    if (query.seller && row.supplierSlug !== query.seller) return false;
    if (skip !== "moq" && query.moq) {
      const [unit, bucket] = query.moq.split(":");
      if (row.moqUnit !== unit || moqBucketOf(row.moq) !== bucket) return false;
    }
    if (query.moqUnit) {
      if (row.moqUnit !== query.moqUnit || row.moq === undefined) return false;
      if (query.minMoq !== undefined && row.moq < query.minMoq) return false;
      if (query.maxMoq !== undefined && row.moq > query.maxMoq) return false;
    }
    if (query.minPrice !== undefined && row.priceHi < query.minPrice) return false;
    if (query.maxPrice !== undefined && row.price > query.maxPrice) return false;
    return true;
  };

  const tally = (skip: Skip, key: (row: Row) => string | undefined, selected: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    rows.forEach((row, at) => {
      if (!matches(row, at, skip)) return;
      const value = key(row);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    // A selected option stays visible even when other filters leave it with no matches.
    for (const value of selected) if (!counts.has(value)) counts.set(value, 0);
    return counts;
  };

  // Base (unfiltered) totals and popular subcategories for the scope.
  const baseSubs = new Map<string, number>();
  const baseCats = new Set<string>();
  const suppliers = new Set<string>();
  const verifiedSuppliers = new Set<string>();
  let min = Infinity;
  let max = 0;
  for (const row of rows) {
    baseSubs.set(row.sub, (baseSubs.get(row.sub) ?? 0) + 1);
    baseCats.add(row.cat);
    suppliers.add(row.supplier);
    if (row.verified) verifiedSuppliers.add(row.supplier);
    min = Math.min(min, row.price);
    max = Math.max(max, row.priceHi);
  }
  const subLabel = (value: string) => index.subLabels.get(value) ?? value;
  const byCount = (a: FacetOption, b: FacetOption) => b.count - a.count || a.label.localeCompare(b.label);
  const toOptions = (counts: Map<string, number>, labeller: (v: string) => string = (v) => v): FacetOption[] =>
    [...counts.entries()].map(([value, count]) => ({ value, label: labeller(value), count })).sort(byCount);

  const chips = scoped && !lockedSub ? toOptions(baseSubs, subLabel) : [];
  const categoryFacet = scoped ? [] : toOptions(tally("category", (r) => r.cat, query.category), (v) => index.catNames.get(v) ?? v);
  const subFacet = lockedSub ? [] : toOptions(tally("sub", (r) => r.sub, query.sub), subLabel);
  const stateFacet = toOptions(tally("state", (r) => r.state, query.state));
  const cityFacet = toOptions(tally("city", (r) => r.city, query.city));
  const typeFacet = index.supportsType ? toOptions(tally("type", (r) => r.type, query.type)) : null;
  const colourFacet = index.supportsColour ? toOptions(tally("colour", (r) => r.colour, query.colour)) : null;

  let moqFacet: FacetOption[] | null = null;
  if (index.supportsMoq) {
    const counts = tally("moq", (r) => (r.moqUnit && moqBucketOf(r.moq) ? `${r.moqUnit}:${moqBucketOf(r.moq)}` : undefined), query.moq ? [query.moq] : []);
    // Buckets are per unit and never mix units; units with the most products come first.
    const perUnit = new Map<string, number>();
    for (const [value, count] of counts) perUnit.set(value.split(":")[0], (perUnit.get(value.split(":")[0]) ?? 0) + count);
    const units = [...perUnit.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([unit]) => unit);
    moqFacet = units.flatMap((unit) =>
      MOQ_BUCKETS.map((bucket) => `${unit}:${bucket.value}`)
        .filter((value) => counts.has(value))
        .map((value) => ({ value, label: describeMoq(value), count: counts.get(value) ?? 0 })),
    );
  }

  // The result set.
  const hits: number[] = [];
  rows.forEach((row, at) => {
    if (matches(row, at)) hits.push(at);
  });
  if (query.sort === "price-asc") hits.sort((a, b) => rows[a].price - rows[b].price || a - b);
  else if (query.sort === "price-desc") hits.sort((a, b) => rows[b].price - rows[a].price || a - b);
  else if (words.length) {
    const phrase = searchText(query.q);
    const score = new Map<number, number>();
    for (const at of hits) {
      const row = rows[at];
      let points = 0;
      for (const w of words) {
        if (row.words.includes(w)) points += 6;
        else if (row.words.some((word) => word.startsWith(w))) points += 4;
        else if (row.nameNorm.includes(w)) points += 3;
        else points += 1;
      }
      if (row.nameNorm.startsWith(phrase)) points += 5;
      else if (row.nameNorm.includes(phrase)) points += 2;
      score.set(at, points);
    }
    hits.sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || a - b);
  }

  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.limit ?? options.pageSize ?? PAGE_SIZE));
  const total = hits.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.page, totalPages);
  const slice = hits.slice((page - 1) * pageSize, page * pageSize);
  const items: ListingItem[] = slice.map((at) => {
    const row = rows[at];
    const source = row.src ?? index.sources.get(row.cat)!;
    const card = source.kind === "catalog" ? toProductCard(source.catalog![row.i]) : source.sample![row.i];
    return {
      card,
      meta: {
        source: source.kind,
        category: { id: row.cat, name: index.catNames.get(row.cat) ?? row.cat },
        subcategory: { id: row.sub, name: subLabel(row.sub) },
        department: row.department,
        colour: row.colour,
        supplierKey: source.kind === "catalog" ? row.supplier : row.supplierSlug,
        supplierSlug: row.supplierSlug,
        supplierType: row.type,
        verified: row.verified,
      },
    };
  });

  const activeFilters =
    query.category.length +
    (lockedSub ? 0 : query.sub.length) +
    query.department.length +
    query.type.length +
    query.state.length +
    query.city.length +
    query.colour.length +
    (query.seller ? 1 : 0) +
    (query.moq || query.moqUnit ? 1 : 0) +
    (query.minPrice !== undefined || query.maxPrice !== undefined ? 1 : 0);

  return {
    record: options.record,
    totals: {
      products: rows.length,
      suppliers: suppliers.size,
      verifiedSuppliers: index.source === "sample" ? verifiedSuppliers.size : null,
      subcategories: lockedSub ? 0 : baseSubs.size,
      categories: baseCats.size,
    },
    chips,
    facets: {
      categories: categoryFacet,
      subcategories: subFacet,
      supplierTypes: typeFacet,
      moq: moqFacet,
      locations: stateFacet,
      cities: cityFacet,
      colours: colourFacet,
      price: rows.length ? { min: min === Infinity ? 0 : min, max } : null,
    },
    results: {
      products: items.map((item) => item.card),
      items,
      total,
      page,
      totalPages,
      pageSize,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    search,
    activeFilters,
    applied: { ...query, page, limit: query.limit },
    ignored,
  };
}

export interface ListingOptions {
  /** Lock the listing to one subcategory (Page 04). */
  sub?: string;
  /** Page size when the query has no explicit limit. */
  pageSize?: number;
}

/** Listing of one category (Pages 03 and 04). Undefined for an unknown category. */
export function getCategoryListing(slug: string, query: ListingQuery, options: ListingOptions = {}): CategoryListing | undefined {
  const record = getCategoryRecord(slug);
  const index = record ? indexFor(record.id) : undefined;
  if (!record || !index) return undefined;
  return build(index, query, { record, sub: options.sub, pageSize: options.pageSize });
}

/** Listing across every discoverable category: All Products (Page 05), search (Page 07) and the public API. */
export function getProductListing(query: ListingQuery, options: { pageSize?: number } = {}): CategoryListing {
  const index = indexFor(ALL) as Index;
  return build(index, query, { pageSize: options.pageSize });
}

export interface SubcategoryInfo {
  value: string;
  label: string;
  products: number;
  suppliers: number;
  verifiedSuppliers: number | null;
  /** Catalog department (Men, Women, ...) when the source has one. */
  group?: string;
  /** A real product photo of this subcategory, or undefined. */
  imageSrc?: string;
  imageRemote?: boolean;
  /** Eligible subcategories related to this one (same department for the catalog), most products first. */
  siblings: FacetOption[];
}

/**
 * Looks a subcategory up inside its parent. Returns undefined when the parent does not exist, the
 * subcategory is not part of that parent, or it has no eligible products (not publicly discoverable).
 */
export function getSubcategoryInfo(slug: string, subSlug: string): SubcategoryInfo | undefined {
  const record = getCategoryRecord(slug);
  const index = record ? indexFor(record.id) : undefined;
  if (!record || !index) return undefined;
  if (!index.subLabels.has(subSlug)) return undefined;

  const counts = new Map<string, number>();
  const suppliers = new Set<string>();
  const verified = new Set<string>();
  let firstRow: Row | undefined;
  for (const row of index.rows) {
    counts.set(row.sub, (counts.get(row.sub) ?? 0) + 1);
    if (row.sub === subSlug) {
      firstRow ??= row;
      suppliers.add(row.supplier);
      if (row.verified) verified.add(row.supplier);
    }
  }
  const products = counts.get(subSlug) ?? 0;
  if (products === 0 || !firstRow) return undefined;

  const group = index.subGroup.get(subSlug);
  const siblings = [...counts.entries()]
    .filter(([value]) => (group ? index.subGroup.get(value) === group : true))
    .map(([value, count]) => ({ value, label: index.subLabels.get(value) ?? value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  let imageSrc: string | undefined;
  let imageRemote: boolean | undefined;
  if (index.source === "catalog") {
    imageSrc = index.catalog![firstRow.i].imageUrl;
    imageRemote = true;
  } else {
    const tile = index.sample![firstRow.i].tile;
    imageSrc = "imageSrc" in tile ? tile.imageSrc : undefined;
  }

  return {
    value: subSlug,
    label: index.subLabels.get(subSlug) ?? subSlug,
    products,
    suppliers: suppliers.size,
    verifiedSuppliers: index.source === "sample" ? verified.size : null,
    group,
    imageSrc,
    imageRemote,
    siblings,
  };
}

export interface Suggestion {
  type: "product" | "category";
  label: string;
  /** Where choosing it goes: a search for a product name, a category page for a category. */
  href: string;
}

/**
 * Suggestions for the search boxes, from real data only: distinct product names that start with what was
 * typed (then names with a word that starts with it), and category or subcategory names that contain it.
 * Needs at least two characters; no trending or historic searches are involved.
 */
export function getSuggestions(rawQuery: string, limit = 8): Suggestion[] {
  const text = searchText(normalizeSearchQuery(rawQuery));
  if (text.length < 2) return [];
  const words = searchTokens(text);
  if (words.length === 0) return [];
  const index = indexFor(ALL) as Index;

  const startsWith: string[] = [];
  const wordStart: string[] = [];
  const seen = new Set<string>();
  for (const row of index.rows) {
    if (startsWith.length >= limit) break;
    const key = row.nameNorm;
    if (seen.has(key)) continue;
    if (key.startsWith(text)) {
      seen.add(key);
      startsWith.push(row.name);
    } else if (wordStart.length < limit && words.every((w) => row.words.some((word) => word.startsWith(w)))) {
      seen.add(key);
      wordStart.push(row.name);
    }
  }
  const productNames = [...startsWith, ...wordStart].slice(0, limit - 2 > 3 ? limit - 2 : limit);

  const categories: Suggestion[] = [];
  const match = (label: string) => words.every((w) => searchText(label).split(/[^a-z0-9]+/).some((word) => word.startsWith(w)));
  for (const [id, name] of index.catNames) if (match(name)) categories.push({ type: "category", label: name, href: `/categories/${id}` });
  for (const [id, label] of index.subLabels) {
    const cat = index.subCat.get(id);
    if (cat && match(label)) categories.push({ type: "category", label: `${label} in ${index.catNames.get(cat) ?? cat}`, href: `/categories/${cat}/${id}` });
  }

  const out: Suggestion[] = productNames.map((name) => ({ type: "product", label: name, href: `/search?q=${encodeURIComponent(name)}` }));
  out.push(...categories.slice(0, Math.max(0, limit - out.length)));
  return out.slice(0, limit);
}

// ---------- one supplier's products (Page 10)

const globalForSupplierIndexes = globalThis as unknown as { __finbynSupplierProductIndexesV2?: Map<string, Index | null> };

/**
 * An index of the sample listings of one sample supplier, across every sample category page (the textile listings
 * are not part of the all-products index, because Apparel & Fashion is backed by the catalog). Built on the same
 * row shape as every other index, so the same search, filters, facets, sort and pagination apply.
 */
function sampleSupplierIndex(slug: string): Index | null {
  const cache = (globalForSupplierIndexes.__finbynSupplierProductIndexesV2 ??= new Map());
  if (cache.has(slug)) return cache.get(slug) ?? null;

  const href = `/suppliers/${slug}`;
  const rows: Row[] = [];
  const sources = new Map<string, Source>();
  const catNames = new Map<string, string>();
  const subLabels = new Map<string, string>();
  const subCat = new Map<string, string>();

  for (const page of Object.values(CATEGORY_PAGES)) {
    const mainId = canonicalCategorySlug(page.slug);
    const categoryName = getCategoryRecord(mainId)?.name ?? page.name;
    const labels = new Map(page.subcategories.map((sub) => [sub.id, sub.name]));
    page.products.forEach((p, i) => {
      if (p.supplierHref !== href) return;
      sources.set(mainId, { kind: "sample", sample: page.products });
      catNames.set(mainId, categoryName);
      const subLabel = labels.get(p.subcategoryId) ?? p.subcategoryId;
      subLabels.set(p.subcategoryId, subLabel);
      subCat.set(p.subcategoryId, mainId);
      const nameNorm = searchText(p.name);
      rows.push({
        i,
        cat: mainId,
        sub: p.subcategoryId,
        name: p.name,
        nameNorm,
        words: wordsOf(nameNorm),
        hay: searchText(`${p.name} ${subLabel} ${categoryName}`),
        price: p.priceMin,
        priceHi: p.priceMax ?? p.priceMin,
        state: p.supplierState,
        city: p.supplierCity,
        type: p.supplierType,
        moq: p.moq,
        moqUnit: p.moqUnit ? unitKey(p.moqUnit) : undefined,
        supplier: p.supplierHref,
        supplierSlug: slug,
        verified: p.verified,
      });
    });
  }

  const index: Index | null = rows.length
    ? {
        source: "sample",
        rows,
        sources,
        catNames,
        subLabels,
        subGroup: new Map(),
        subCat,
        departments: new Set(),
        sellerSlugs: new Set([slug]),
        supportsType: rows.some((r) => r.type),
        supportsMoq: rows.some((r) => r.moq !== undefined && r.moqUnit),
        supportsColour: false,
      }
    : null;
  cache.set(slug, index);
  return index;
}

/**
 * The products of one supplier, with search, filters, facets, sort and pagination. The supplier is fixed here by
 * the caller (the route's resolved slug) and overrides any `seller` in the query, so a client can never widen the
 * list to other suppliers. Facet counts are therefore this supplier's own. Undefined when the supplier has no
 * listed products or does not exist.
 */
/**
 * The list of a sample supplier that is also a seed seller (see ADOPTED_SELLERS): the seller's photographed catalogue
 * first, then the supplier's sample listings, in one index so search, filters, sort and paging work across both.
 */
function adoptedSupplierIndex(slug: string): Index | null {
  const cache = (globalForSupplierIndexes.__finbynSupplierProductIndexesV2 ??= new Map());
  const key = `adopted:${slug}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const all = indexFor(ALL) as Index;
  const sample = sampleSupplierIndex(slug);
  const catalogRows = all.rows.filter((row) => row.supplierSlug === slug && all.sources.get(row.cat)?.kind === "catalog");
  const sampleRows = (sample?.rows ?? []).map((row) => ({ ...row, src: sample?.sources.get(row.cat) }));
  const index: Index | null =
    catalogRows.length + sampleRows.length === 0
      ? null
      : {
          source: "mixed",
          rows: [...catalogRows, ...sampleRows],
          sources: all.sources,
          catNames: new Map([...all.catNames, ...(sample?.catNames ?? [])]),
          subLabels: new Map([...all.subLabels, ...(sample?.subLabels ?? [])]),
          subGroup: all.subGroup,
          subCat: new Map([...all.subCat, ...(sample?.subCat ?? [])]),
          departments: new Set(catalogRows.map((row) => row.department).filter((d): d is string => Boolean(d))),
          sellerSlugs: new Set([slug]),
          supportsType: Boolean(sample?.supportsType),
          supportsMoq: Boolean(sample?.supportsMoq),
          supportsColour: true,
        };
  cache.set(key, index);
  return index;
}

export function getSupplierProductListing(slug: string, query: ListingQuery, options: { pageSize?: number } = {}): CategoryListing | undefined {
  const scoped = { ...query, seller: slug };
  if (adoptedSeller(slug)) {
    const merged = adoptedSupplierIndex(slug);
    return merged ? build(merged, scoped, { pageSize: options.pageSize }) : undefined;
  }
  if (getCatalog().sellerBySlug.has(slug)) return build(indexFor(ALL) as Index, scoped, { pageSize: options.pageSize });
  const index = sampleSupplierIndex(slug);
  return index ? build(index, scoped, { pageSize: options.pageSize }) : undefined;
}
