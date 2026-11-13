import { ADOPTED_SELLERS, getCatalog } from "@/lib/catalog/data";
import { isEquivalent, signatureOf, type Signature } from "./matchingRules";
import type { CatalogProduct } from "@/types";

/**
 * Candidate source of policy match-1: the catalogue listings (`db/seed`, loaded once into memory by `getCatalog`; NOT a per-inquiry scan: one Map lookup by
 * signature). Approved MongoDB supplier products are deliberately NOT a source yet: no public surface reads them and the quotation engine cannot resolve their
 * product keys, so a lead for them could not be quoted (docs/leads/MATCHING_POLICY.md, "Sources").
 * A seller's inquiry key is its seller id, or its sample-supplier slug when the seed seller is an adopted sample supplier (same rule as resolveSupplier).
 */
const slugOfAdopted = new Map(Object.entries(ADOPTED_SELLERS).map(([slug, id]) => [id, slug]));
export const sellerKeyOf = (sellerId: string): string => slugOfAdopted.get(sellerId) ?? sellerId;

const sigOf = (p: CatalogProduct): Signature | null => signatureOf({ categoryId: `${p.categoryName}|${p.department}|${p.productType}`, name: p.name, colour: p.colour });

let byName: Map<string, CatalogProduct[]> | undefined;
function index(): Map<string, CatalogProduct[]> {
  if (byName) return byName;
  const map = new Map<string, CatalogProduct[]>();
  for (const p of getCatalog().products) {
    const s = sigOf(p);
    if (!s) continue;
    const k = `${s.categoryId}|${s.nameKey}`;
    const list = map.get(k);
    if (list) list.push(p);
    else map.set(k, [p]);
  }
  return (byName = map);
}

export const requirementOf = (productId: number): { signature: Signature; sellerKey: string; productName: string } | null => {
  const p = getCatalog().productById.get(productId);
  const signature = p ? sigOf(p) : null;
  return p && signature ? { signature, sellerKey: sellerKeyOf(p.sellerId), productName: p.name } : null;
};

export interface Candidate {
  sellerKey: string;
  productKey: string;
}

/** One entry per seller (its lowest product id), sorted by (sellerKey, productKey): deterministic. The requested product's own seller is excluded. */
export function equivalentCandidates(required: Signature, directSellerKey: string): Candidate[] {
  const list = index().get(`${required.categoryId}|${required.nameKey}`) ?? [];
  const best = new Map<string, number>();
  for (const p of list) {
    if (!isEquivalent(required, sigOf(p))) continue;
    const key = sellerKeyOf(p.sellerId);
    if (key === directSellerKey) continue;
    const have = best.get(key);
    if (have === undefined || p.id < have) best.set(key, p.id);
  }
  return [...best.entries()].map(([sellerKey, id]) => ({ sellerKey, productKey: String(id) })).sort((a, b) => (a.sellerKey < b.sellerKey ? -1 : a.sellerKey > b.sellerKey ? 1 : 0));
}
