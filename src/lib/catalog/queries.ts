import type { CatalogProduct, CatalogSeller } from "@/types";
import { getCatalog } from "./data";
import { searchTokens } from "./slug";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface Facet {
  name: string;
  count: number;
}

function paginate<T>(all: T[], page: number | undefined, pageSize: number): Page<T> {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page ?? 1) || 1), totalPages);
  return { items: all.slice((current - 1) * pageSize, current * pageSize), total, page: current, totalPages };
}

function countBy<T>(items: T[], key: (item: T) => string): Facet[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------- sellers ----------

export type SellerSort = "rating" | "products" | "name";

export interface SellerQuery {
  q?: string;
  specialization?: string;
  state?: string;
  sort?: SellerSort;
  page?: number;
  pageSize?: number;
}

export function listSellers(query: SellerQuery = {}): Page<CatalogSeller> {
  const { sellers, sellerSearch } = getCatalog();
  const words = searchTokens(query.q);

  let matches = sellers.filter((seller, i) => {
    if (query.specialization && seller.specialization !== query.specialization) return false;
    if (query.state && seller.state !== query.state) return false;
    return words.every((w) => sellerSearch[i].includes(w));
  });

  const sort = query.sort ?? "rating";
  matches = [...matches].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "products") return b.productCount - a.productCount || a.name.localeCompare(b.name);
    return b.rating - a.rating || b.productCount - a.productCount || a.name.localeCompare(b.name);
  });

  return paginate(matches, query.page, query.pageSize ?? 24);
}

export function getSellerBySlug(slug: string): CatalogSeller | undefined {
  return getCatalog().sellerBySlug.get(slug);
}

export function getSellerFacets(): { specializations: Facet[]; states: Facet[] } {
  const { sellers } = getCatalog();
  return {
    specializations: countBy(sellers, (s) => s.specialization),
    states: countBy(sellers, (s) => s.state),
  };
}

export function getSellerProducts(sellerId: string): CatalogProduct[] {
  return getCatalog().productsBySeller.get(sellerId) ?? [];
}

/** The categories a seller actually carries, most products first. */
export function getSellerTopCategories(sellerId: string, limit = 4): string[] {
  return countBy(getSellerProducts(sellerId), (p) => p.categoryName)
    .slice(0, limit)
    .map((f) => f.name);
}

// ---------- products ----------

export type ProductSort = "relevance" | "price-asc" | "price-desc" | "name";

export interface ProductQuery {
  q?: string;
  department?: string;
  category?: string;
  colour?: string;
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

export function listProducts(query: ProductQuery = {}): Page<CatalogProduct> {
  const { products, productSearch } = getCatalog();
  const words = searchTokens(query.q);

  let matches = products.filter((p, i) => {
    if (query.department && p.department !== query.department) return false;
    if (query.category && p.categoryName !== query.category) return false;
    if (query.colour && p.colour !== query.colour) return false;
    if (query.sellerId && p.sellerId !== query.sellerId) return false;
    if (query.minPrice !== undefined && p.estimatedPriceInr < query.minPrice) return false;
    if (query.maxPrice !== undefined && p.estimatedPriceInr > query.maxPrice) return false;
    return words.every((w) => productSearch[i].includes(w));
  });

  const sort = query.sort ?? "relevance";
  if (sort === "price-asc") matches = [...matches].sort((a, b) => a.estimatedPriceInr - b.estimatedPriceInr || a.id - b.id);
  else if (sort === "price-desc") matches = [...matches].sort((a, b) => b.estimatedPriceInr - a.estimatedPriceInr || a.id - b.id);
  else if (sort === "name") matches = [...matches].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);

  return paginate(matches, query.page, query.pageSize ?? 24);
}

/** Resolves `<name>-<id>`. Returns undefined for a malformed slug or unknown id. */
export function getProductBySlug(slug: string): CatalogProduct | undefined {
  const match = /-(\d+)$/.exec(slug);
  if (!match) return undefined;
  return getCatalog().productById.get(Number(match[1]));
}

export function getProductFacets(): {
  departments: Facet[];
  categories: (Facet & { department: string })[];
  colours: Facet[];
} {
  const { products } = getCatalog();
  const departmentOf = new Map(products.map((p) => [p.categoryName, p.department]));
  return {
    departments: countBy(products, (p) => p.department),
    categories: countBy(products, (p) => p.categoryName).map((f) => ({ ...f, department: departmentOf.get(f.name) ?? "" })),
    colours: countBy(products, (p) => p.colour),
  };
}

export function getRelatedProducts(product: CatalogProduct, limit = 4): CatalogProduct[] {
  const { products, productsBySeller } = getCatalog();
  const sameSellerSameCategory = (productsBySeller.get(product.sellerId) ?? []).filter(
    (p) => p.id !== product.id && p.categoryName === product.categoryName,
  );
  const sameCategory = products.filter((p) => p.categoryName === product.categoryName && p.id !== product.id);
  const picked = new Map<number, CatalogProduct>();
  for (const p of [...sameSellerSameCategory, ...sameCategory]) {
    if (picked.size >= limit) break;
    picked.set(p.id, p);
  }
  return [...picked.values()];
}

export function getCatalogTotals(): { sellers: number; products: number } {
  const { sellers, products } = getCatalog();
  return { sellers: sellers.length, products: products.length };
}
