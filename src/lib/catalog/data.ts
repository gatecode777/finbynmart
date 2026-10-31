import fs from "node:fs";
import path from "node:path";
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

  // Sample suppliers on the homepage own these slugs, so catalog sellers may not reuse them.
  const takenSlugs = new Set(FEATURED_SUPPLIERS.map((s) => s.id));
  const sellers: CatalogSeller[] = [];
  for (const row of readSeed("sellers.csv")) {
    if (row.status !== "Active") continue;
    let slug = slugify(row.name);
    if (!slug || takenSlugs.has(slug)) slug = `${slug}-${row.id.toLowerCase()}`;
    takenSlugs.add(slug);
    sellers.push({
      id: row.id,
      slug,
      name: row.name,
      city: row.city,
      state: row.state,
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
  for (const row of readSeed("products.csv")) {
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

const globalForCatalog = globalThis as unknown as { __finbynCatalog?: Catalog };

export function getCatalog(): Catalog {
  globalForCatalog.__finbynCatalog ??= load();
  return globalForCatalog.__finbynCatalog;
}
