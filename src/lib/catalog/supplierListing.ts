import { getCatalog } from "./data";
import { MAX_PAGE_SIZE, type FacetOption } from "./listingQuery";
import { initials, searchText, searchTokens, slugify } from "./slug";
import { SUPPLIER_PAGE_SIZE, type SupplierQuery } from "./supplierQuery";

export * from "./supplierQuery";

/**
 * Server-only. The supplier directory engine (Page 08): search, filters, facets, sort and pagination over the
 * catalog's active sellers. Only approved public fields leave this module: no email, phone or owner (never loaded).
 *
 * What the data has: name, city, state, one specialisation, join date, and the seller's real products. It has NO
 * supplier type, business type, verification, years in business, turnover, certifications, rating from reviews or
 * logo. So there are no filters or badges for those, and every supplier is "unverified" (there is no verification
 * workflow; the catalog sellers are fictional sample data).
 *
 * Search (one supplier appears once, however many of its products match): the words are matched against the company
 * name, city, state, specialisation, the names of its product categories and the names of its products. Every
 * word must match; words of up to three letters must start a word, longer ones match anywhere. Ranking: a company
 * name word that equals a search word 8, starts with it 6, contains it 5; city, state or specialisation 3; only a product or
 * category 1; the whole phrase at the start of the company name +5, inside it +2; ties keep the source order.
 *
 * Facet counts: each group is counted with the search and every other filter applied but not its own filter.
 */
export interface SupplierItem {
  id: string;
  slug: string;
  name: string;
  initials: string;
  city: string;
  state: string;
  industry: string;
  productCount: number;
  /** The supplier's own most common product categories, for the card. */
  categories: string[];
  /** A real photo of one of the supplier's own products (hot-linked dataset photo), or null. */
  image: string | null;
  memberSince: string;
  verificationStatus: "verified" | "unverified";
  url: string;
}

interface Row {
  i: number;
  item: SupplierItem;
  nameNorm: string;
  words: string[];
  hay: string;
  where: string;
  catIds: Set<string>;
  joined: string;
  verified: boolean;
}

interface Index {
  rows: Row[];
  catLabels: Map<string, string>;
  totals: { suppliers: number; industries: number; states: number; cities: number; products: number };
}

const globalForSuppliers = globalThis as unknown as { __finbynSupplierIndexV2?: Index };
const wordsOf = (norm: string) => norm.split(/[^a-z0-9]+/).filter(Boolean);

function build(): Index {
  const { sellers, productsBySeller } = getCatalog();
  const catLabels = new Map<string, string>();
  const rows: Row[] = [];

  for (const seller of sellers) {
    const products = productsBySeller.get(seller.id) ?? [];
    if (products.length === 0) continue; // a supplier with nothing listed is not shown
    const perCategory = new Map<string, number>();
    const names = new Set<string>();
    for (const p of products) {
      perCategory.set(p.categoryName, (perCategory.get(p.categoryName) ?? 0) + 1);
      names.add(searchText(p.name));
      catLabels.set(slugify(p.categoryName), p.categoryName);
    }
    const topCategories = [...perCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
    const nameNorm = searchText(seller.name);
    const where = searchText(`${seller.city} ${seller.state} ${seller.specialization}`);
    rows.push({
      i: rows.length,
      item: {
        id: seller.id,
        slug: seller.slug,
        name: seller.name,
        initials: initials(seller.name),
        city: seller.city,
        state: seller.state,
        industry: seller.specialization,
        productCount: seller.productCount,
        categories: topCategories.slice(0, 3),
        image: products[0].imageUrl,
        memberSince: seller.joinedDate.slice(0, 4),
        verificationStatus: "unverified",
        url: `/suppliers/${seller.slug}`,
      },
      nameNorm,
      words: wordsOf(nameNorm),
      hay: `${nameNorm} ${where} ${searchText(topCategories.join(" "))} ${[...names].join(" ")}`,
      where,
      catIds: new Set([...perCategory.keys()].map(slugify)),
      joined: seller.joinedDate,
      verified: false,
    });
  }

  return {
    rows,
    catLabels,
    totals: {
      suppliers: rows.length,
      industries: new Set(rows.map((r) => r.item.industry)).size,
      states: new Set(rows.map((r) => r.item.state)).size,
      cities: new Set(rows.map((r) => r.item.city)).size,
      products: rows.reduce((sum, r) => sum + r.item.productCount, 0),
    },
  };
}

function getIndex(): Index {
  globalForSuppliers.__finbynSupplierIndexV2 ??= build();
  return globalForSuppliers.__finbynSupplierIndexV2;
}

type Skip = "industry" | "state" | "city" | "category" | "verification";

export interface SupplierListing {
  totals: Index["totals"] & { verified: number };
  facets: {
    industries: FacetOption[];
    states: FacetOption[];
    cities: FacetOption[];
    categories: FacetOption[];
    /** Null when no supplier is verified, so the group is not offered. */
    verification: FacetOption[] | null;
  };
  /** About the search text alone, before any filter (only with search text). */
  search?: { suppliers: number };
  results: { items: SupplierItem[]; total: number; page: number; totalPages: number; pageSize: number; hasNextPage: boolean; hasPreviousPage: boolean };
  activeFilters: number;
  applied: SupplierQuery;
  ignored: { param: string; value: string }[];
}

export function getSupplierListing(requested: SupplierQuery, options: { pageSize?: number } = {}): SupplierListing {
  const index = getIndex();
  const rows = index.rows;

  const ignored: { param: string; value: string }[] = [];
  const query: SupplierQuery = {
    ...requested,
    category: requested.category.filter((value) => (index.catLabels.has(value) ? true : (ignored.push({ param: "category", value }), false))),
  };

  const words = searchTokens(query.q).slice(0, 8);
  const textMatch: Uint8Array | null = words.length
    ? Uint8Array.from(rows, (row) => (words.every((w) => (w.length <= 3 ? row.hay.startsWith(w) || row.hay.includes(` ${w}`) : row.hay.includes(w))) ? 1 : 0))
    : null;

  const matches = (row: Row, at: number, skip?: Skip): boolean => {
    if (textMatch && !textMatch[at]) return false;
    if (skip !== "industry" && query.industry.length && !query.industry.includes(row.item.industry)) return false;
    if (skip !== "state" && query.state.length && !query.state.includes(row.item.state)) return false;
    if (skip !== "city" && query.city.length && !query.city.includes(row.item.city)) return false;
    if (skip !== "category" && query.category.length && !query.category.some((id) => row.catIds.has(id))) return false;
    if (skip !== "verification" && query.verification.length && !query.verification.includes(row.verified ? "verified" : "unverified")) return false;
    return true;
  };

  const tally = (skip: Skip, key: (row: Row) => string | string[], selected: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    rows.forEach((row, at) => {
      if (!matches(row, at, skip)) return;
      for (const value of [key(row)].flat()) counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    for (const value of selected) if (!counts.has(value)) counts.set(value, 0);
    return counts;
  };
  const toOptions = (counts: Map<string, number>, labeller: (v: string) => string = (v) => v): FacetOption[] =>
    [...counts.entries()].map(([value, count]) => ({ value, label: labeller(value), count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const verifiedCount = rows.filter((r) => r.verified).length;
  const hits: number[] = [];
  rows.forEach((row, at) => {
    if (matches(row, at)) hits.push(at);
  });

  if (query.sort === "name") hits.sort((a, b) => rows[a].item.name.localeCompare(rows[b].item.name) || a - b);
  else if (query.sort === "newest") hits.sort((a, b) => (rows[b].joined < rows[a].joined ? -1 : rows[b].joined > rows[a].joined ? 1 : 0) || a - b);
  else if (query.sort === "products") hits.sort((a, b) => rows[b].item.productCount - rows[a].item.productCount || a - b);
  else if (words.length) {
    const phrase = searchText(query.q);
    const score = new Map<number, number>();
    for (const at of hits) {
      const row = rows[at];
      let points = 0;
      for (const w of words) {
        if (row.words.includes(w)) points += 8;
        else if (row.words.some((word) => word.startsWith(w))) points += 6;
        else if (row.nameNorm.includes(w)) points += 5;
        else if (row.where.includes(w)) points += 3;
        else points += 1;
      }
      if (row.nameNorm.startsWith(phrase)) points += 5;
      else if (row.nameNorm.includes(phrase)) points += 2;
      score.set(at, points);
    }
    hits.sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || a - b);
  }

  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.limit ?? options.pageSize ?? SUPPLIER_PAGE_SIZE));
  const total = hits.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.page, totalPages);

  const activeFilters = query.industry.length + query.state.length + query.city.length + query.category.length + query.verification.length;

  return {
    totals: { ...index.totals, verified: verifiedCount },
    facets: {
      industries: toOptions(tally("industry", (r) => r.item.industry, query.industry)),
      states: toOptions(tally("state", (r) => r.item.state, query.state)),
      cities: toOptions(tally("city", (r) => r.item.city, query.city)),
      categories: toOptions(tally("category", (r) => [...r.catIds], query.category), (v) => index.catLabels.get(v) ?? v),
      verification: verifiedCount > 0 ? toOptions(tally("verification", (r) => (r.verified ? "verified" : "unverified"), query.verification), (v) => (v === "verified" ? "Verified" : "Not verified")) : null,
    },
    search: textMatch ? { suppliers: textMatch.reduce((n, flag) => n + flag, 0) } : undefined,
    results: {
      items: hits.slice((page - 1) * pageSize, page * pageSize).map((at) => rows[at].item),
      total,
      page,
      totalPages,
      pageSize,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    activeFilters,
    applied: { ...query, page, limit: query.limit },
    ignored,
  };
}
