import { FEATURED_SUPPLIERS } from "@/lib/constants/suppliers";
import { getProductBySlug as getSampleProduct, getProductsBySupplier } from "@/lib/constants/categoryPages";
import { ADOPTED_SELLERS, getCatalog } from "./data";

/**
 * Server-only. Resolves a product or supplier key sent by a client into a verified public record.
 * Anything that does not resolve is treated as nonexistent: requests for it are refused.
 *
 * Keys: catalog products are their numeric id ("1163"); sample B2B products are their slug
 * ("industrial-air-compressor"). Suppliers are a catalog seller id ("SLR0873") or slug, or a
 * sample supplier slug ("shree-textiles").
 */
export interface ProductRef {
  key: string;
  name: string;
  source: "catalog" | "sample";
  supplierKey: string;
  supplierName: string;
  /** The unit the price is quoted per ("Piece"). */
  priceUnit: string;
  /** Minimum order, when the record has one (sample listings only). */
  moq?: { quantity: number; unit: string };
}

export interface SupplierRef {
  key: string;
  name: string;
  source: "catalog" | "sample";
}

export function resolveProduct(rawKey: string): ProductRef | undefined {
  const key = rawKey.trim();
  if (!key || key.length > 80) return undefined;

  if (/^\d+$/.test(key)) {
    const { productById, sellerById } = getCatalog();
    const product = productById.get(Number(key));
    const seller = product ? sellerById.get(product.sellerId) : undefined;
    if (!product || !seller) return undefined;
    const adoptedAs = Object.entries(ADOPTED_SELLERS).find(([, id]) => id === seller.id)?.[0];
    return { key, name: product.name, source: "catalog", supplierKey: adoptedAs ?? seller.id, supplierName: seller.name, priceUnit: "Piece" };
  }

  const sample = getSampleProduct(key);
  if (!sample) return undefined;
  const { product } = sample;
  return {
    key: product.id,
    name: product.name,
    source: "sample",
    supplierKey: product.supplierHref.replace(/^\/suppliers\//, ""),
    supplierName: product.supplierName,
    priceUnit: product.priceUnit,
    moq: product.moq !== undefined && product.moqUnit ? { quantity: product.moq, unit: product.moqUnit } : undefined,
  };
}

export function resolveSupplier(rawKey: string): SupplierRef | undefined {
  const key = rawKey.trim();
  if (!key || key.length > 80) return undefined;

  const { sellerById, sellerBySlug } = getCatalog();
  const seller = sellerById.get(key) ?? sellerBySlug.get(key);
  // A sample supplier that is also a seed seller keeps its own slug as its key (the same key its sample listings use).
  if (seller && ADOPTED_SELLERS[seller.slug] === seller.id) return { key: seller.slug, name: seller.name, source: "sample" };
  if (seller) return { key: seller.id, name: seller.name, source: "catalog" };

  const featured = FEATURED_SUPPLIERS.find((supplier) => supplier.id === key);
  if (featured) return { key: featured.id, name: featured.name, source: "sample" };

  const listed = getProductsBySupplier(`/suppliers/${key}`)[0];
  if (listed) return { key, name: listed.supplierName, source: "sample" };
  return undefined;
}
