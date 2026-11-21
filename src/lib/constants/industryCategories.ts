import { TOP_CATEGORIES } from "./categories";
import { INDUSTRY_SOLUTIONS } from "./industries";

/**
 * Which MAIN categories an industry page may list (Page 10). No such relationship existed before this file, and a category name or title keyword is not a relationship, so nothing
 * here is inferred: an entry is USED only when its status is APPROVED, which needs a named approver and a date. A PROPOSED entry is documentation for the owner to approve and is
 * ignored by every consumer; an industry with no APPROVED entry shows the honest "mapping not configured" state, never the whole catalogue and never a keyword guess.
 *
 * To approve a mapping: change `status` to "APPROVED" and fill `approvedBy` and `approvedOn` (YYYY-MM-DD). `validateIndustryMap` (unit-tested against this file) refuses an unknown industry,
 * an unknown category id, a duplicate, an APPROVED entry without an approver and date, and an empty approved list. Only MAIN category ids (the canonical ids of TOP_CATEGORIES) are
 * supported: the listing engine already includes every subcategory below a main category (a fixed two-level tree, so there is no cycle or depth to traverse). Whether a mapped
 * category is shown is still decided by the central rule (the category must be active and have public products), so an admin deactivation always wins.
 */
export type MappingStatus = "APPROVED" | "PROPOSED";
export interface IndustryCategoryMapping {
  industryId: string;
  categoryIds: string[];
  status: MappingStatus;
  /** Where the relationship comes from, in words. */
  source: string;
  approvedBy?: string;
  approvedOn?: string;
}

const PROPOSAL = "Engineering proposal read from the category names. NOT approved by the owner, so it is not used.";

export const INDUSTRY_CATEGORY_MAP: IndustryCategoryMapping[] = [
  { industryId: "manufacturing", categoryIds: ["industrial-machinery", "electrical-electronics", "chemicals-dyes", "packaging-printing"], status: "PROPOSED", source: PROPOSAL },
  { industryId: "construction", categoryIds: ["construction-real-estate", "industrial-machinery"], status: "PROPOSED", source: PROPOSAL },
  { industryId: "agriculture", categoryIds: ["agriculture"], status: "PROPOSED", source: PROPOSAL },
  { industryId: "healthcare", categoryIds: ["health-pharma"], status: "PROPOSED", source: PROPOSAL },
  { industryId: "food-processing", categoryIds: ["food-beverages", "packaging-printing"], status: "PROPOSED", source: PROPOSAL },
  { industryId: "retail-wholesale", categoryIds: ["apparel-fashion", "home-lifestyle"], status: "PROPOSED", source: PROPOSAL },
  { industryId: "hospitality", categoryIds: ["food-beverages", "home-lifestyle"], status: "PROPOSED", source: PROPOSAL },
  // education: no category relationship is obvious, so there is no proposal: the owner decides
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with a mapping list (empty = valid). Pure: the same function is used by the unit test and by the resolver's safety net. */
export function validateIndustryMap(list: readonly IndustryCategoryMapping[], industries: readonly string[] = INDUSTRY_SOLUTIONS.map((i) => i.id), categories: readonly string[] = TOP_CATEGORIES.map((c) => c.id)): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    if (!industries.includes(m.industryId)) problems.push(`${m.industryId}: unknown industry`);
    if (seen.has(m.industryId)) problems.push(`${m.industryId}: duplicate entry`);
    seen.add(m.industryId);
    const bad = m.categoryIds.filter((c) => !categories.includes(c));
    if (bad.length) problems.push(`${m.industryId}: unknown category ${bad.join(", ")}`);
    if (new Set(m.categoryIds).size !== m.categoryIds.length) problems.push(`${m.industryId}: duplicate category`);
    if (!m.source.trim()) problems.push(`${m.industryId}: the source of the relationship is required`);
    if (m.status === "APPROVED") {
      if (m.categoryIds.length === 0) problems.push(`${m.industryId}: an approved mapping needs at least one category`);
      if (!m.approvedBy?.trim() || !m.approvedOn || !DAY.test(m.approvedOn)) problems.push(`${m.industryId}: an approved mapping needs approvedBy and approvedOn (YYYY-MM-DD)`);
    }
  }
  return problems;
}

/** The APPROVED category ids of an industry, or null when none is approved (never a guess). Deduplicated, in the configured order. */
export function approvedCategoriesFor(industryId: string, list: readonly IndustryCategoryMapping[] = INDUSTRY_CATEGORY_MAP): string[] | null {
  if (validateIndustryMap(list).length) return null;
  const m = list.find((x) => x.industryId === industryId && x.status === "APPROVED");
  return m && m.categoryIds.length ? [...new Set(m.categoryIds)] : null;
}
