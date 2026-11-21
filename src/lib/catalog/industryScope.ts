import { approvedCategoriesFor } from "@/lib/constants/industryCategories";
import { getCategoryDirectory } from "./categories";
import { industryListableCategories } from "./categoryListing";

/**
 * What an industry page may list, resolved on the server (never from the request). Three different facts, never one empty state:
 *  - UNMAPPED: no APPROVED mapping exists for this industry (nothing is inferred from names or keywords, and the catalogue is never shown as a fallback);
 *  - MAPPED with no discoverable category: the mapping is approved but none of its categories is currently public (inactive, or no public products);
 *  - MAPPED with categories: the listing is limited to exactly those main categories.
 * Whether a mapped category is public is the central rule (`getCategoryDirectory`: active and with eligible products), so an administrator's deactivation always wins and an approved
 * mapping alone never makes an industry look populated.
 */
export type IndustryScope = { state: "UNMAPPED" } | { state: "MAPPED"; configured: string[]; categories: { id: string; name: string }[] };

export function resolveIndustryScope(industryId: string): IndustryScope {
  const configured = approvedCategoriesFor(industryId);
  if (!configured) return { state: "UNMAPPED" };
  const mains = new Map(getCategoryDirectory().nodes.filter((n) => n.parentId === null).map((n) => [n.id, n.name]));
  return { state: "MAPPED", configured, categories: industryListableCategories(configured).filter((id) => mains.has(id)).map((id) => ({ id, name: mains.get(id)! })) };
}
