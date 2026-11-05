import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { categoryOfProduct } from "@/lib/buyer/dashboard";
import { slugify } from "@/lib/catalog/slug";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { formatPriceRange } from "@/lib/utils/format";
import { SAVED_CAP, type SavedQuery } from "./savedProductsRules";

/**
 * The buyer's saved products for the Saved Products page. The rows are the existing `wishlists` collection (nothing is copied or
 * duplicated); the product details (name, image, price, supplier, category) are read from the catalogue for the saved keys only,
 * at most SAVED_CAP of them, never the whole catalogue. Every query names the buyer from the session.
 *
 * A saved product that has since left the catalogue is NOT dropped silently: it is listed as unavailable with the name it was saved
 * under, and can be removed.
 */
export interface SavedProductItem {
  key: string;
  savedAt: string;
  available: boolean;
  name: string;
  url: string | null;
  imageSrc: string | null;
  imageRemote: boolean;
  shortDescription: string | null;
  category: { id: string; name: string } | null;
  price: { text: string; unit: string } | null;
  supplier: { name: string; url: string | null; verified: boolean; inquiryHref: string | null } | null;
}

export interface SavedProductsPage {
  items: SavedProductItem[];
  /** The categories of the saved products (under the current search), most first. */
  categories: { id: string; name: string; count: number }[];
  /** Everything the buyer has saved, whatever the filters. */
  totalSaved: number;
  /** Saved products matching the search, whatever the category (the number on the "All Saved" tab). */
  totalMatchingSearch: number;
  /** Items matching the current filters. */
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Row extends SavedProductItem {
  sortName: string;
  sortPrice: number;
  savedMs: number;
}

function toRow(key: string, savedName: string, savedAt: Date): Row {
  const product = getPublicProductByKey(key);
  const base = { key, savedAt: savedAt.toISOString(), savedMs: savedAt.getTime() };
  if (!product) return { ...base, available: false, name: savedName, url: null, imageSrc: null, imageRemote: false, shortDescription: null, category: null, price: null, supplier: null, sortName: savedName.toLowerCase(), sortPrice: Number.POSITIVE_INFINITY };
  const image = product.images.find((i) => i.primary) ?? product.images[0];
  const categoryName = categoryOfProduct(key);
  return {
    ...base,
    available: true,
    name: product.name,
    url: product.url,
    imageSrc: image?.src ?? null,
    imageRemote: Boolean(image?.remote),
    shortDescription: product.shortDescription,
    category: { id: slugify(categoryName), name: categoryName },
    price: { text: formatPriceRange(product.pricing.min, product.pricing.max), unit: product.pricing.unit },
    supplier: { name: product.supplier.name, url: product.supplier.profileAvailable ? product.supplier.url : null, verified: product.supplier.verificationStatus === "verified", inquiryHref: product.supplier.profileAvailable ? `/inquiry/${product.supplier.slug}?product=${encodeURIComponent(product.slug)}` : null },
    sortName: product.name.toLowerCase(),
    sortPrice: product.pricing.min,
  };
}

const bySort: Record<SavedQuery["sort"], (a: Row, b: Row) => number> = {
  recent: (a, b) => b.savedMs - a.savedMs || b.key.localeCompare(a.key),
  oldest: (a, b) => a.savedMs - b.savedMs || a.key.localeCompare(b.key),
  name: (a, b) => a.sortName.localeCompare(b.sortName) || a.key.localeCompare(b.key),
  "name-desc": (a, b) => b.sortName.localeCompare(a.sortName) || a.key.localeCompare(b.key),
  "price-low": (a, b) => a.sortPrice - b.sortPrice || a.key.localeCompare(b.key),
  "price-high": (a, b) => (b.sortPrice === Number.POSITIVE_INFINITY ? -1 : a.sortPrice === Number.POSITIVE_INFINITY ? 1 : b.sortPrice - a.sortPrice) || a.key.localeCompare(b.key),
};

export async function listSavedProducts(userId: string, query: SavedQuery): Promise<SavedProductsPage> {
  const rows = await (await getDb())
    .collection("wishlists")
    .find({ userId: new ObjectId(userId) }, { projection: { productKey: 1, productName: 1, addedAt: 1 } })
    .sort({ addedAt: -1, _id: -1 })
    .limit(SAVED_CAP)
    .toArray();
  const all = rows.map((r) => toRow(String(r.productKey), String(r.productName ?? "Saved product"), r.addedAt as Date));

  const needle = query.q.toLowerCase();
  const matches = (row: Row) => !needle || row.name.toLowerCase().includes(needle) || (row.supplier?.name.toLowerCase().includes(needle) ?? false);
  const underSearch = all.filter(matches);

  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const row of underSearch) {
    if (!row.category) continue;
    const entry = counts.get(row.category.id) ?? { id: row.category.id, name: row.category.name, count: 0 };
    entry.count += 1;
    counts.set(row.category.id, entry);
  }
  const categories = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const filtered = (query.category ? underSearch.filter((r) => r.category?.id === query.category) : underSearch).sort(bySort[query.sort]);
  const start = (query.page - 1) * query.limit;
  const items = filtered.slice(start, start + query.limit).map(({ sortName, sortPrice, savedMs, ...item }) => {
    void sortName; void sortPrice; void savedMs;
    return item;
  });
  return { items, categories, totalSaved: all.length, totalMatchingSearch: underSearch.length, total: filtered.length, page: query.page, limit: query.limit, totalPages: Math.ceil(filtered.length / query.limit) };
}
