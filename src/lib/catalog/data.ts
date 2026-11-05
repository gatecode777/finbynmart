import fs from "node:fs";
import path from "node:path";
import { CATEGORY_PAGES } from "@/lib/constants/categoryPages";
import { FEATURED_SUPPLIERS } from "@/lib/constants/suppliers";
import type { CatalogProduct, CatalogSeller } from "@/types";
import { parseCSV } from "./csv";
import { searchText, slugify } from "./slug";

/**
 * Server-only. Loads the seed CSVs in db/seed (built by `npm run catalog:build`)
 * into memory once and indexes them. This module is the single seam to replace
 * if the catalog moves to a hosted database — everything else calls queries.ts.
 *
 * Data caveats (see docs/MISSING_ASSETS.md): sellers are fictional; product
 * name/image/category/colour come from a research-only dataset; price and sizes
 * are estimates. Only active sellers are loaded and seller contact fields
 * (email, phone, owner) are never read.
 */
export interface Catalog {
  sellers: CatalogSeller[];
  sellerById: Map<string, CatalogSeller>;
  sellerBySlug: Map<string, CatalogSeller>;
  products: CatalogProduct[];
  productById: Map<number, CatalogProduct>;
  productsBySeller: Map<string, CatalogProduct[]>;
  productSearch: string[];
  sellerSearch: string[];
}

const SEED_DIR = path.join(process.cwd(), "db", "seed");

/**
 * Sample suppliers that are also one seller of the seed catalogue (sample supplier slug -> seller id). Shree Textiles
 * has 8 sample fabric listings without photographs; the seed seller of the same name (SLR0216, 21 products with
 * photos) is that company's catalogue. The seller takes the sample supplier's slug and location, so its products
 * carry the supplier's own page on every route (cards, product pages, search, the supplier's product list) instead of
 * a second "Shree Textiles" in another city. Listed in docs/MISSING_ASSETS.md as sample data.
 */
export const ADOPTED_SELLERS: Record<string, string> = { "shree-textiles": "SLR0216" };
const ADOPTED_SLUG_BY_SELLER = new Map(Object.entries(ADOPTED_SELLERS).map(([slug, id]) => [id, slug]));

function readSeed(file: string): Record<string, string>[] {
  return parseCSV(fs.readFileSync(path.join(SEED_DIR, file), "utf8"));
}

function load(): Catalog {
  const categories = new Map(
    readSeed("categories.csv").map((c) => [c.id, { name: c.name, department: c.department, productType: c.product_type }]),
  );

  const sizesByProduct = new Map<string, string[]>();
  for (const row of readSeed("product_sizes.csv")) {
    const list = sizesByProduct.get(row.product_id);
    if (list) list.push(row.size);
    else sizesByProduct.set(row.product_id, [row.size]);
  }

  // Sample suppliers (the homepage ones and the suppliers of the sample listings) own these slugs, so a catalog
  // seller with the same name gets a suffixed slug instead of taking over a sample supplier's page.
  const takenSlugs = new Set([
    ...FEATURED_SUPPLIERS.map((s) => s.id),
    ...Object.values(CATEGORY_PAGES).flatMap((page) => page.products.map((p) => p.supplierHref.replace(/^\/suppliers\//, ""))),
  ]);
  const sellers: CatalogSeller[] = [];
  for (const row of readSeed("sellers.csv")) {
    if (row.status !== "Active") continue;
    const adoptedSlug = ADOPTED_SLUG_BY_SELLER.get(row.id);
    const home = adoptedSlug ? FEATURED_SUPPLIERS.find((s) => s.id === adoptedSlug) : undefined;
    let slug = adoptedSlug ?? slugify(row.name);
    if (!adoptedSlug && (!slug || takenSlugs.has(slug))) slug = `${slug}-${row.id.toLowerCase()}`;
    takenSlugs.add(slug);
    sellers.push({
      id: row.id,
      slug,
      name: row.name,
      city: home?.city ?? row.city,
      state: home?.state ?? row.state,
      specialization: row.specialization,
      rating: Number(row.rating),
      joinedDate: row.joined_date,
      productCount: 0,
    });
  }
  const sellerById = new Map(sellers.map((s) => [s.id, s]));
  const sellerBySlug = new Map(sellers.map((s) => [s.slug, s]));

  const products: CatalogProduct[] = [];
  const productsBySeller = new Map<string, CatalogProduct[]>();
  // FINBYN_CATALOG_LIMIT keeps only the first N products: a test aid for measuring a smaller catalogue (never set in production).
  const productLimit = Number(process.env.FINBYN_CATALOG_LIMIT) || Infinity;
  for (const row of readSeed("products.csv").slice(0, productLimit)) {
    const category = categories.get(row.category_id);
    const seller = sellerById.get(row.seller_id);
    if (!category || !seller) continue;
    const id = Number(row.id);
    const product: CatalogProduct = {
      id,
      slug: `${slugify(row.name)}-${id}`,
      name: row.name,
      colour: row.colour,
      categoryName: category.name,
      department: category.department,
      productType: category.productType,
      estimatedPriceInr: Number(row.estimated_price_inr),
      sizes: sizesByProduct.get(row.id) ?? [],
      // The source uses http; the same host serves https, which avoids mixed content.
      imageUrl: row.source_image_url.replace(/^http:/, "https:"),
      sellerId: row.seller_id,
    };
    products.push(product);
    const list = productsBySeller.get(seller.id);
    if (list) list.push(product);
    else productsBySeller.set(seller.id, [product]);
    seller.productCount += 1;
  }

  return {
    sellers,
    sellerById,
    sellerBySlug,
    products,
    productById: new Map(products.map((p) => [p.id, p])),
    productsBySeller,
    productSearch: products.map((p) => searchText(`${p.name} ${p.categoryName} ${p.colour}`)),
    sellerSearch: sellers.map((s) => searchText(`${s.name} ${s.city} ${s.state} ${s.specialization}`)),
  };
}

// The cached catalogue, indexes and directories live on globalThis so dev hot reloads reuse them. Change the "V2" suffix
// of their names whenever the shape of what they hold changes, so a running dev server rebuilds them instead of
// reading an object built by older code.
const globalForCatalog = globalThis as unknown as { __finbynCatalogV2?: Catalog };

export function getCatalog(): Catalog {
  globalForCatalog.__finbynCatalogV2 ??= load();
  return globalForCatalog.__finbynCatalogV2;
}

/** The catalogue seller that is the catalogue of a sample supplier, if it has one. */
export function adoptedSeller(slug: string): CatalogSeller | undefined {
  const id = ADOPTED_SELLERS[slug];
  return id ? getCatalog().sellerById.get(id) : undefined;
}

/** Number of sample listings of a supplier (the hand-written ones, not the seed catalogue). */
export function sampleListingCount(slug: string): number {
  return Object.values(CATEGORY_PAGES).reduce((sum, page) => sum + page.products.filter((p) => p.supplierHref === `/suppliers/${slug}`).length, 0);
}
