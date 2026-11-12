import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { getCatalog } from "@/lib/catalog/data";
import type { SupplierContext } from "./company";

export interface SupplierProductItem {
  id: string;
  sku: string;
  name: string;
  slug: string;
  categoryName: string;
  price: number;
  unit: string;
  stock: number;
  status: "ACTIVE" | "LOW_STOCK" | "OUT_OF_STOCK" | "DRAFT";
  imageUrl: string;
  description: string;
  isCatalog: boolean;
  createdAt: string;
}

export interface SupplierProductsSummary {
  total: number;
  active: number;
  inStock: number;
  categories: number;
}

export interface SupplierProductsQuery {
  q?: string;
  category?: string;
  status?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "name_asc";
  page?: number;
  limit?: number;
}

export interface SupplierProductsResult {
  items: SupplierProductItem[];
  summary: SupplierProductsSummary;
  categories: string[];
  meta: {
    page: number;
    limit: number;
    totalPages: number;
    totalCount: number;
  };
}

export interface CreateProductInput {
  name: string;
  sku?: string;
  categoryName: string;
  price: number;
  unit?: string;
  stock: number;
  description?: string;
  imageUrl?: string;
}

export interface SupplierProductDoc {
  _id: ObjectId;
  companyId: ObjectId;
  name: string;
  sku: string;
  slug: string;
  categoryName: string;
  price: number;
  unit: string;
  stock: number;
  status: "ACTIVE" | "LOW_STOCK" | "OUT_OF_STOCK" | "DRAFT";
  imageUrl: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  /** Page 40 draft fields (absent on legacy documents). */
  draft?: {
    revision: number;
    createdBy: ObjectId;
    idempotencyKey: string;
    bodyHash: string;
    skuKey?: string;
    categoryId: string;
    pricingMode: "FIXED" | "ON_REQUEST";
    currency: "INR";
    unitPricePaise: number | null;
    priceUnit: string;
    moq: number | null;
    quantityUnit: string;
    images?: { fileId: string; url: string; name: string }[];
  };
}

export async function getProductsCollection(): Promise<Collection<SupplierProductDoc>> {
  const db = await getDb();
  const col = db.collection<SupplierProductDoc>("supplier_products");
  await col.createIndex({ companyId: 1, createdAt: -1 });
  // SKU is unique per company only (no global rule), and only when one was entered.
  await col.createIndex({ companyId: 1, "draft.skuKey": 1 }, { unique: true, partialFilterExpression: { "draft.skuKey": { $gt: "" } }, name: "supplier_product_sku_per_company" });
  // exactly-once creation per company + actor + client key, enforced by the database
  await col.createIndex({ companyId: 1, "draft.createdBy": 1, "draft.idempotencyKey": 1 }, { unique: true, partialFilterExpression: { "draft.idempotencyKey": { $gt: "" } }, name: "supplier_product_draft_idem" });
  return col;
}

/** Every product this company owns (catalogue + custom), unpaged. Used by the list and by inventory. */
export async function collectSupplierProducts(context: SupplierContext): Promise<SupplierProductItem[]> {
  const catalog = getCatalog();
  const allProducts: SupplierProductItem[] = [];

  // 1. Collect catalog products owned by company's sellerKeys
  for (const sellerKey of context.company.sellerKeys) {
    const list = catalog.productsBySeller.get(sellerKey) ?? [];
    for (const p of list) {
      allProducts.push({
        id: `cat-${p.id}`,
        sku: `SKU-${p.id}`,
        name: p.name,
        slug: p.slug,
        categoryName: p.categoryName || "General",
        price: p.estimatedPriceInr || 0,
        unit: "Piece",
        stock: 50, // Catalog default stock
        status: "ACTIVE",
        imageUrl: p.imageUrl || "",
        description: `${p.colour ? `Colour: ${p.colour}. ` : ""}${p.department || ""} ${p.productType || ""}`.trim(),
        isCatalog: true,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // 2. Collect custom products created by this supplier
  const col = await getProductsCollection();
  const customProducts = await col.find({ companyId: context.companyId }).sort({ createdAt: -1 }).toArray();

  for (const p of customProducts) {
    const stockStatus =
      p.status === "DRAFT" ? "DRAFT" : p.stock <= 0 ? "OUT_OF_STOCK" : p.stock <= 10 ? "LOW_STOCK" : "ACTIVE";
    allProducts.push({
      id: p._id.toString(),
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      categoryName: p.categoryName,
      price: p.price,
      unit: p.unit || "Piece",
      stock: p.stock,
      status: stockStatus,
      imageUrl: p.imageUrl || "",
      description: p.description || "",
      isCatalog: false,
      createdAt: p.createdAt.toISOString(),
    });
  }
  return allProducts;
}

export async function getSupplierProducts(
  context: SupplierContext,
  query: SupplierProductsQuery = {}
): Promise<SupplierProductsResult> {
  const allProducts = await collectSupplierProducts(context);

  // Summary counts before filters
  const uniqueCategories = Array.from(new Set(allProducts.map((p) => p.categoryName))).filter(Boolean);
  const summary: SupplierProductsSummary = {
    total: allProducts.length,
    active: allProducts.filter((p) => p.status === "ACTIVE" || p.status === "LOW_STOCK").length,
    inStock: allProducts.filter((p) => p.stock > 0).length,
    categories: uniqueCategories.length,
  };

  // 3. Apply filters
  let filtered = allProducts;

  if (query.q && query.q.trim()) {
    const term = query.q.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.categoryName.toLowerCase().includes(term)
    );
  }

  if (query.category && query.category !== "all") {
    filtered = filtered.filter((p) => p.categoryName.toLowerCase() === query.category!.toLowerCase());
  }

  if (query.status && query.status !== "all") {
    filtered = filtered.filter((p) => p.status.toLowerCase() === query.status!.toLowerCase());
  }

  // 4. Sort
  const sort = query.sort ?? "newest";
  filtered.sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return a.price - b.price;
      case "price_desc":
        return b.price - a.price;
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  // 5. Pagination
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 15));
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  return {
    items: paginated,
    summary,
    categories: uniqueCategories,
    meta: {
      page,
      limit,
      totalPages,
      totalCount,
    },
  };
}

export async function createSupplierProduct(
  context: SupplierContext,
  input: CreateProductInput
): Promise<{ ok: true; product: SupplierProductItem } | { ok: false; message: string }> {
  if (!input.name || input.name.trim().length < 2) {
    return { ok: false, message: "Product name must be at least 2 characters." };
  }
  if (!input.categoryName || !input.categoryName.trim()) {
    return { ok: false, message: "Category name is required." };
  }
  if (typeof input.price !== "number" || input.price < 0) {
    return { ok: false, message: "Please enter a valid price." };
  }

  const sku = input.sku?.trim() || `SKU-${Date.now().toString(36).toUpperCase()}`;
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const col = await getProductsCollection();
  const now = new Date();
  const stock = Math.max(0, input.stock ?? 0);
  const status = stock <= 0 ? "OUT_OF_STOCK" : stock <= 10 ? "LOW_STOCK" : "ACTIVE";

  const doc: SupplierProductDoc = {
    _id: new ObjectId(),
    companyId: context.companyId,
    name: input.name.trim(),
    sku,
    slug: `${slug}-${sku.toLowerCase()}`,
    categoryName: input.categoryName.trim(),
    price: input.price,
    unit: input.unit?.trim() || "Piece",
    stock,
    status,
    imageUrl: input.imageUrl?.trim() || "",
    description: input.description?.trim() || "",
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(doc);

  return {
    ok: true,
    product: {
      id: doc._id.toString(),
      sku: doc.sku,
      name: doc.name,
      slug: doc.slug,
      categoryName: doc.categoryName,
      price: doc.price,
      unit: doc.unit,
      stock: doc.stock,
      status: doc.status,
      imageUrl: doc.imageUrl,
      description: doc.description,
      isCatalog: false,
      createdAt: doc.createdAt.toISOString(),
    },
  };
}
