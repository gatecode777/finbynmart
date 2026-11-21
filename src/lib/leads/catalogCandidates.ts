import { ADOPTED_SELLERS, getCatalog } from "@/lib/catalog/data";
import { isEquivalent, signatureOf, type Signature } from "./matchingRules";
import type { CatalogProduct } from "@/types";
import { getApproved } from "@/lib/catalog/approvedStore";
import { attributesMatch, type AttrMap } from "@/lib/catalog/attributes";

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

export interface SupplierCandidate {
  companyId: string;
  sellerKey: string;
  productKey: string;
}

/**
 * Candidates for a SUPPLIER_ATTRIBUTES requirement: approved, publicly eligible supplier products of the same main category whose attributes satisfy every attribute the
 * requirement states. One entry per company (its lowest product id), sorted by company id: deterministic and deduplicated across several matching products. Bounded by the
 * approved snapshot (at most MAX_APPROVED items, no database read). `excludeCompanyId` is the selected supplier's company of a direct inquiry.
 */
export function supplierCandidates(criteria: { nodeId: string; attributes: AttrMap }, excludeCompanyId?: string): SupplierCandidate[] {
  const main = criteria.nodeId.split("/")[0];
  const best = new Map<string, { id: string; key: string }>();
  for (const item of getApproved().items) {
    if (item.main !== main || item.supplier.companyId === excludeCompanyId) continue;
    if (!attributesMatch(item.nodeId, criteria.attributes, item.attributes)) continue;
    const have = best.get(item.supplier.companyId);
    if (!have || item.id < have.id) best.set(item.supplier.companyId, { id: item.id, key: item.supplier.key });
  }
  return [...best.entries()].map(([companyId, v]) => ({ companyId, sellerKey: v.key, productKey: v.id })).sort((a, b) => (a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0));
}
