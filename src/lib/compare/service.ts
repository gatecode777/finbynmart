import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import { getPublicProductByKey } from "@/lib/catalog/productDetail";
import { formatPriceRange } from "@/lib/utils/format";
import { COMPARE_PRODUCTS_MAX, COMPARE_PRODUCTS_MIN, moqCompatibility, planSpecRows, priceCompatibility, rowStatus, type RowStatus } from "./comparisonRules";

/**
 * The buyer's product comparison list (Compare Products). One small list per buyer, at most COMPARE_PRODUCTS_MAX products, in the
 * order they were added. Nothing is ranked or scored: the page shows what the catalogue holds, side by side, and marks the rows
 * where the products differ. Every query names the buyer from the session.
 */
export { COMPARE_PRODUCTS_MIN, COMPARE_PRODUCTS_MAX };

interface CompareDoc {
  _id?: ObjectId;
  userId: ObjectId;
  productKey: string;
  productName: string;
  addedAt: Date;
  /** 0 to COMPARE_PRODUCTS_MAX - 1: a unique (userId, slot) index makes a fifth product impossible, even for simultaneous requests. */
  slot: number;
}

let indexReady: Promise<unknown> | undefined;
async function items(): Promise<Collection<CompareDoc>> {
  const col = (await getDb()).collection<CompareDoc>("compare_items");
  indexReady ??= Promise.all([
    // one row per buyer and product
    col.createIndex({ userId: 1, productKey: 1 }, { unique: true, name: "buyer_compare_product" }),
    // the list in the order added, without an in-database sort
    col.createIndex({ userId: 1, addedAt: 1, _id: 1 }, { name: "buyer_compare_order" }),
    // the limit itself: at most one product per slot, and only four slots
    col.createIndex({ userId: 1, slot: 1 }, { unique: true, partialFilterExpression: { slot: { $exists: true } }, name: "buyer_compare_slot" }),
  ]);
  await indexReady;
  return col;
}

export async function listCompareKeys(userId: string): Promise<string[]> {
  const rows = await (await items()).find({ userId: new ObjectId(userId) }, { projection: { productKey: 1 } }).sort({ addedAt: 1, _id: 1 }).limit(COMPARE_PRODUCTS_MAX).toArray();
  return rows.map((r) => r.productKey);
}

/**
 * true = added, false = it was already there, "limit" = the list already holds COMPARE_PRODUCTS_MAX other products.
 * The limit is enforced by the database, not by counting: a product takes one of four slots and the unique (userId, slot) index lets
 * each slot hold one product, so simultaneous requests can never leave more than four. A taken slot (duplicate key on the slot index)
 * just moves the request on to the next one; running out of slots is the limit.
 */
export async function addToCompare(userId: string, productKey: string, productName: string): Promise<boolean | "limit"> {
  const col = await items();
  const uid = new ObjectId(userId);
  const existing = await col.find({ userId: uid }, { projection: { productKey: 1, slot: 1 } }).limit(COMPARE_PRODUCTS_MAX + 4).toArray();
  if (existing.some((r) => r.productKey === productKey)) return false;
  const used = new Set(existing.map((r) => r.slot));
  for (let slot = 0; slot < COMPARE_PRODUCTS_MAX; slot++) {
    if (used.has(slot)) continue;
    try {
      await col.insertOne({ userId: uid, productKey, productName, addedAt: new Date(), slot });
      return true;
    } catch (error) {
      const e = error as { code?: number; keyPattern?: Record<string, number> };
      if (e.code !== 11000) throw error;
      if (e.keyPattern && "productKey" in e.keyPattern) return false; // the same product was added at the same moment
      // the slot was taken at the same moment: try the next one
    }
  }
  return "limit";
}

export async function removeFromCompare(userId: string, productKey: string): Promise<boolean> {
  return (await (await items()).deleteOne({ userId: new ObjectId(userId), productKey })).deletedCount > 0;
}

export async function clearCompare(userId: string): Promise<number> {
  return (await (await items()).deleteMany({ userId: new ObjectId(userId) })).deletedCount;
}

// ---------- the comparison ----------
export interface CompareColumn {
  key: string;
  available: boolean;
  name: string;
  url: string | null;
  imageSrc: string | null;
  imageRemote: boolean;
  /** The product's own catalogue code (its id). There is no separate SKU or brand in the catalogue, so none is shown. */
  code: string | null;
  supplier: { name: string; url: string | null; verified: boolean } | null;
  inquiryHref: string | null;
  values: Record<string, string | null>;
}

export type FieldSection = "price" | "availability" | "product" | "supplier" | "spec" | "specific";

export interface CompareField {
  key: string;
  label: string;
  section: FieldSection;
  /** The attribute's own group (specifications only). */
  group: string | null;
  status: RowStatus;
  /** True when the products state different values (a missing value is not a value). Kept for callers that only need a flag. */
  differs: boolean;
  /** Columns that carry the neutral "lowest listed" emphasis in this row (price and minimum order, only when comparable). */
  highlight: string[];
  highlightLabel: string | null;
}

export interface ProductComparison {
  columns: CompareColumn[];
  fields: CompareField[];
  /** Rows no compared product has data for (availability, lead time, certifications...): not drawn as empty rows, listed instead. */
  emptyLabels: string[];
  /** "warning" = the numbers cannot be compared as they are; "info" = good to know. */
  notices: { level: "warning" | "info"; text: string }[];
  compatibility: { currencyCompatible: boolean; unitCompatible: boolean; categoryCompatible: boolean };
  capabilities: { addToInquiry: boolean; saveProduct: true; removeProduct: true; clear: true };
  max: number;
  min: number;
}

const BASE: [string, string, FieldSection][] = [
  ["price", "Price", "price"],
  ["unit", "Price Per", "price"],
  ["moq", "Minimum Order", "price"],
  ["availability", "Availability", "availability"],
  ["leadTime", "Lead Time", "availability"],
  ["certifications", "Certifications", "availability"],
  ["warranty", "Warranty", "availability"],
  ["category", "Category", "product"],
  ["subcategory", "Subcategory", "product"],
  ["supplier", "Supplier", "supplier"],
  ["location", "Supplier Location", "supplier"],
  ["supplierType", "Supplier Type", "supplier"],
  ["verification", "Supplier Verification", "supplier"],
  ["rating", "Rating", "supplier"],
];

// Some catalogue products list "Category", "Subcategory" or "Minimum order" among their specifications: those are already rows of their own
// (and read from the same record), so they are not repeated as specification rows.
const ROW_LABELS = new Set(["category", "subcategory", "minimum order", "moq", "price", "price per", "supplier", "supplier location", "supplier type", "rating"]);
const specsOf = <T extends { label: string }>(specs: T[]) => specs.filter((x) => !ROW_LABELS.has(x.label.trim().toLowerCase()));

export async function getProductComparison(userId: string): Promise<ProductComparison> {
  const rows = await (await items()).find({ userId: new ObjectId(userId) }).sort({ addedAt: 1, _id: 1 }).limit(COMPARE_PRODUCTS_MAX).toArray();
  const details = rows.map((r) => ({ row: r, product: getPublicProductByKey(r.productKey) }));

  // which specification rows to show: shared ones by their own group, single-product ones apart (see comparisonRules)
  const specRows = planSpecRows(details.map(({ product }) => specsOf(product?.specifications ?? []).map((x) => ({ group: x.group, label: x.label }))));

  const columns: CompareColumn[] = details.map(({ row, product }) => {
    if (!product) return { key: row.productKey, available: false, name: row.productName, url: null, imageSrc: null, imageRemote: false, code: null, supplier: null, inquiryHref: null, values: {} };
    const image = product.images.find((i) => i.primary) ?? product.images[0];
    const values: Record<string, string | null> = {
      price: `${formatPriceRange(product.pricing.min, product.pricing.max)}${product.pricing.type === "estimated" ? " (estimated)" : ""}`,
      unit: product.pricing.unit,
      moq: product.moq ? `${product.moq.quantity.toLocaleString("en-IN")} ${product.moq.unit}` : null,
      // no availability, lead time, certification or warranty data exists in the catalogue: these stay null and are never guessed
      availability: product.availability,
      leadTime: null,
      certifications: null,
      warranty: null,
      category: product.category.name,
      subcategory: product.subcategory?.name ?? null,
      supplier: product.supplier.name,
      location: [product.supplier.city, product.supplier.state].filter(Boolean).join(", ") || null,
      supplierType: product.supplier.type,
      verification: product.supplier.verificationStatus === "verified" ? "Verified" : "Not verified",
      rating: product.rating ? `${product.rating.value}${product.rating.count ? ` (${product.rating.count.toLocaleString("en-IN")} ratings)` : ""}` : null,
    };
    for (const sr of specRows) {
      const found = specsOf(product.specifications).filter((x) => x.group === sr.group && x.label === sr.label).map((x) => `${x.value}${x.unit ? ` ${x.unit}` : ""}`);
      values[sr.key] = found.length > 0 ? found.join(", ") : null;
    }
    return {
      key: row.productKey,
      available: true,
      name: product.name,
      url: product.url,
      imageSrc: image?.src ?? null,
      imageRemote: Boolean(image?.remote),
      code: product.id,
      supplier: { name: product.supplier.name, url: product.supplier.profileAvailable ? product.supplier.url : null, verified: product.supplier.verificationStatus === "verified" },
      inquiryHref: product.supplier.profileAvailable ? `/inquiry/${product.supplier.slug}?product=${encodeURIComponent(product.slug)}` : null,
      values,
    };
  });

  const liveDetails = details.filter((d) => d.product);
  const live = columns.filter((c) => c.available);

  // price and minimum order: comparable only with the same currency and unit; the lowest is emphasised neutrally, never called best
  const priceCompat = priceCompatibility(liveDetails.map(({ product }) => ({ currency: product!.pricing.currency, unit: product!.pricing.unit, min: product!.pricing.min })));
  const moqCompat = moqCompatibility(liveDetails.map(({ product }) => (product!.moq ? { quantity: product!.moq.quantity, unit: product!.moq.unit } : null)));
  const categoryCompatible = new Set(liveDetails.map(({ product }) => product!.category.id)).size <= 1;
  const keysOf = (idx: number[]) => idx.map((n) => live[n].key);

  const defs: { key: string; label: string; section: FieldSection; group: string | null }[] = [...BASE.map(([key, label, section]) => ({ key, label, section, group: null })), ...specRows.map((sr) => ({ key: sr.key, label: sr.label, section: (sr.specific ? "specific" : "spec") as FieldSection, group: sr.group }))];
  const fields: CompareField[] = [];
  const emptyLabels: string[] = [];
  for (const def of defs) {
    const status = rowStatus(live.map((c) => c.values[def.key] ?? null));
    if (status === "empty") {
      if (def.section !== "spec" && def.section !== "specific") emptyLabels.push(def.label);
      continue;
    }
    const highlight = def.key === "price" ? keysOf(priceCompat.lowest) : def.key === "moq" ? keysOf(moqCompat.lowest) : [];
    fields.push({ ...def, status, differs: status === "differs", highlight, highlightLabel: highlight.length > 0 ? (def.key === "price" ? "Lowest listed price" : "Lowest minimum order") : null });
  }

  const notices: ProductComparison["notices"] = [];
  if (live.length >= 2 && !priceCompat.currencyCompatible) notices.push({ level: "warning", text: "These products are priced in different currencies, so their prices are shown separately and not compared." });
  if (live.length >= 2 && !priceCompat.unitCompatible) notices.push({ level: "warning", text: "These products are priced per different units, so their prices are not like for like and no price is emphasised." });
  if (live.length >= 2 && !categoryCompatible) notices.push({ level: "info", text: "These products are in different categories: only the attributes they share are compared, and attributes of a single product are listed apart." });
  if (liveDetails.some(({ product }) => product?.pricing.type === "estimated")) notices.push({ level: "info", text: "Catalogue prices are estimates, not quotations. Ask the supplier for a quote to get a real price." });
  if (columns.some((c) => !c.available)) notices.push({ level: "warning", text: "Some products are no longer available. Remove them to keep your comparison current." });

  return {
    columns,
    fields,
    emptyLabels,
    notices,
    compatibility: { currencyCompatible: priceCompat.currencyCompatible, unitCompatible: priceCompat.unitCompatible, categoryCompatible },
    capabilities: { addToInquiry: live.some((c) => c.inquiryHref), saveProduct: true, removeProduct: true, clear: true },
    max: COMPARE_PRODUCTS_MAX,
    min: COMPARE_PRODUCTS_MIN,
  };
}
