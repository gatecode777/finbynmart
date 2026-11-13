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
  /** null = no stock figure is recorded (never a made-up number). Real balances live in the inventory ledger. */
  stock: number | null;
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
    /** Moderation of one exact revision. While PENDING the draft cannot be edited (withdraw first). */
    review?: { state: "PENDING" | "APPROVED" | "REJECTED"; submittedRevision: number; submittedAt: Date; submittedBy: ObjectId; snapshot: Record<string, unknown>; decidedAt?: Date; decidedBy?: ObjectId; reasonCode?: string; internalNote?: string };
  };
  /** Set only by an authorized reviewer's approval of an exact revision. The one fact public discovery may rely on. */
  publication?: { state: "APPROVED"; revision: number; approvedAt: Date; approvedBy: ObjectId; /** The APPROVED content. Public reads use this, never the editable draft, so later edits stay private until a new approval replaces it. */ snapshot: Record<string, unknown> };
}

export async function getProductsCollection(): Promise<Collection<SupplierProductDoc>> {
  const db = await getDb();
  const col = db.collection<SupplierProductDoc>("supplier_products");
  await col.createIndex({ companyId: 1, createdAt: -1 });
  // the other list sorts, company-scoped (audit M-06)
  await col.createIndex({ companyId: 1, name: 1, _id: 1 }, { name: "supplier_products_by_name", collation: { locale: "en" } });
  await col.createIndex({ companyId: 1, price: 1, _id: 1 }, { name: "supplier_products_by_price" });
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
        stock: null, // the catalogue records no stock; none is invented
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
      stock: p.status === "DRAFT" ? null : p.stock,
      status: stockStatus,
      imageUrl: p.imageUrl || "",
      description: p.description || "",
      isCatalog: false,
      createdAt: p.createdAt.toISOString(),
    });
  }
  return allProducts;
}

/** Catalogue products of the company's own sellers: an in-memory structure (the catalogue is CSV), no database read. Newest sort puts them after custom products. */
function catalogueItems(context: SupplierContext): SupplierProductItem[] {
  const catalog = getCatalog();
  const out: SupplierProductItem[] = [];
  for (const sellerKey of context.company.sellerKeys) {
    for (const p of catalog.productsBySeller.get(sellerKey) ?? []) {
      out.push({ id: `cat-${p.id}`, sku: `SKU-${p.id}`, name: p.name, slug: p.slug, categoryName: p.categoryName || "General", price: p.estimatedPriceInr || 0, unit: "Piece", stock: null, status: "ACTIVE", imageUrl: p.imageUrl || "", description: `${p.colour ? `Colour: ${p.colour}. ` : ""}${p.department || ""} ${p.productType || ""}`.trim(), isCatalog: true, createdAt: new Date(0).toISOString() });
    }
  }
  return out;
}

const toCustomItem = (p: SupplierProductDoc): SupplierProductItem => {
  const stockStatus = p.status === "DRAFT" ? "DRAFT" : p.stock <= 0 ? "OUT_OF_STOCK" : p.stock <= 10 ? "LOW_STOCK" : "ACTIVE";
  return { id: p._id.toString(), sku: p.sku, name: p.name, slug: p.slug, categoryName: p.categoryName, price: p.price, unit: p.unit || "Piece", stock: p.status === "DRAFT" ? null : p.stock, status: stockStatus, imageUrl: p.imageUrl || "", description: p.description || "", isCatalog: false, createdAt: p.createdAt.toISOString() };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MERGE_WINDOW_MAX = 2000;

/**
 * One page of the supplier's products. Custom products are filtered, counted, sorted and windowed by the database (company-scoped and indexed);
 * catalogue products come from the in-memory catalogue (no database read). The page is the merge of the first page*limit rows of each source, so a
 * request never reads more than page*limit custom documents (capped at ${MERGE_WINDOW_MAX}). Summary counts are database aggregates, not a download.
 */
export async function getSupplierProducts(context: SupplierContext, query: SupplierProductsQuery = {}): Promise<SupplierProductsResult> {
  const limit = Math.min(50, Math.max(1, Math.floor(query.limit ?? 15)));
  const page = Math.max(1, Math.min(Math.floor(MERGE_WINDOW_MAX / limit), Math.floor(query.page ?? 1)));
  const sort = query.sort ?? "newest";
  const col = await getProductsCollection();
  const base = { companyId: context.companyId };
  const catalogue = catalogueItems(context);

  // summary over everything the company owns (counts only)
  const [customTotal, customActive, customInStock, customCats] = await Promise.all([
    col.countDocuments(base),
    col.countDocuments({ ...base, status: { $ne: "DRAFT" }, stock: { $gt: 0 } }),
    col.countDocuments({ ...base, status: { $ne: "DRAFT" }, stock: { $gt: 0 } }),
    col.distinct("categoryName", base),
  ]);
  const categories = Array.from(new Set([...customCats, ...catalogue.map((p) => p.categoryName)])).filter(Boolean).sort();
  const summary: SupplierProductsSummary = { total: customTotal + catalogue.length, active: customActive + catalogue.length, inStock: customInStock, categories: categories.length };

  // filters, expressed once for the database and once for the in-memory catalogue
  const term = (query.q ?? "").trim().slice(0, 60);
  const category = query.category && query.category !== "all" ? query.category : null;
  const status = query.status && query.status !== "all" ? query.status.toUpperCase() : null;
  const filter: Record<string, unknown> = { ...base };
  if (term) { const re = escapeRe(term); filter.$or = [{ name: { $regex: re, $options: "i" } }, { sku: { $regex: re, $options: "i" } }, { categoryName: { $regex: re, $options: "i" } }]; }
  if (category) filter.categoryName = { $regex: `^${escapeRe(category)}$`, $options: "i" };
  if (status === "DRAFT") filter.status = "DRAFT";
  else if (status === "OUT_OF_STOCK") Object.assign(filter, { status: { $ne: "DRAFT" }, stock: { $lte: 0 } });
  else if (status === "LOW_STOCK") Object.assign(filter, { status: { $ne: "DRAFT" }, stock: { $gt: 0, $lte: 10 } });
  else if (status === "ACTIVE") Object.assign(filter, { status: { $ne: "DRAFT" }, stock: { $gt: 10 } });
  const catFiltered = catalogue.filter((p) => {
    const lc = term.toLowerCase();
    if (term && !(p.name.toLowerCase().includes(lc) || p.sku.toLowerCase().includes(lc) || p.categoryName.toLowerCase().includes(lc))) return false;
    if (category && p.categoryName.toLowerCase() !== category.toLowerCase()) return false;
    return !status || status === "ACTIVE";
  });

  const dbSort: Record<string, 1 | -1> = sort === "price_asc" ? { price: 1, _id: 1 } : sort === "price_desc" ? { price: -1, _id: 1 } : sort === "name_asc" ? { name: 1, _id: 1 } : { createdAt: -1, _id: -1 };
  const [customCount, customRows] = await Promise.all([
    col.countDocuments(filter as never),
    // the collation is only used for the name sort (its index carries it); other sorts keep the default so their indexes can serve them
    (sort === "name_asc" ? col.find(filter as never).collation({ locale: "en" }) : col.find(filter as never)).sort(dbSort).limit(page * limit).toArray(),
  ]);
  const cmp = (x: SupplierProductItem, y: SupplierProductItem) =>
    sort === "price_asc" ? x.price - y.price || x.id.localeCompare(y.id)
    : sort === "price_desc" ? y.price - x.price || x.id.localeCompare(y.id)
    : sort === "name_asc" ? x.name.localeCompare(y.name) || x.id.localeCompare(y.id)
    : new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime() || y.id.localeCompare(x.id);
  const merged = [...customRows.map(toCustomItem), ...catFiltered].sort(cmp);

  const totalCount = customCount + catFiltered.length;
  return { items: merged.slice((page - 1) * limit, page * limit), summary, categories, meta: { page, limit, totalPages: Math.max(1, Math.ceil(totalCount / limit)), totalCount } };
}

/**
 * One product of this company by its exact id: a custom product (ObjectId) read by _id AND companyId, or a catalogue product ("cat-<id>") that
 * belongs to one of the company's own sellers. No company-wide read.
 */
export async function findOwnedProduct(context: SupplierContext, id: string): Promise<SupplierProductItem | null> {
  if (id.startsWith("cat-")) {
    const num = Number(id.slice(4));
    const p = Number.isInteger(num) ? getCatalog().productById.get(num) : undefined;
    if (!p || !context.company.sellerKeys.includes(String(p.sellerId))) return null;
    return { id, sku: `SKU-${p.id}`, name: p.name, slug: p.slug, categoryName: p.categoryName || "General", price: p.estimatedPriceInr || 0, unit: "Piece", stock: null, status: "ACTIVE", imageUrl: p.imageUrl || "", description: "", isCatalog: true, createdAt: new Date(0).toISOString() };
  }
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const p = await (await getProductsCollection()).findOne({ _id: new ObjectId(id), companyId: context.companyId });
  if (!p) return null;
  return { id: p._id.toString(), sku: p.sku, name: p.name, slug: p.slug, categoryName: p.categoryName, price: p.price, unit: p.unit || "Piece", stock: p.status === "DRAFT" ? null : p.stock, status: p.status, imageUrl: p.imageUrl || "", description: p.description || "", isCatalog: false, createdAt: p.createdAt.toISOString() };
}
