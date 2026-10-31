import { getProductBySlug } from "./categoryPages";
import type { B2BProduct } from "@/types";

/**
 * Homepage "Featured Products" picks real records from categoryPages.ts, so
 * every card links to a product page that actually resolves. The products,
 * suppliers, prices and ratings are sample data for visual development — see
 * docs/MISSING_ASSETS.md. Photos are licensed Pexels images — see
 * docs/IMAGE_SOURCE_MANIFEST.md.
 */
const FEATURED_PRODUCT_IDS = [
  "industrial-air-compressor",
  "solar-panel-540w",
  "mens-cotton-tshirt",
  "corrugated-packaging-boxes",
  "stainless-steel-pipes",
  "pharma-tablets",
];

export const FEATURED_PRODUCTS: B2BProduct[] = FEATURED_PRODUCT_IDS.flatMap((id) => {
  const result = getProductBySlug(id);
  return result ? [result.product] : [];
});
