import { TOP_CATEGORIES } from "./categories";
import { CATEGORY_PAGES } from "./categoryPages";

/** Homepage/nav slugs whose real page lives under a different slug. */
const ALIASES: Record<string, string> = {
  "packaging-printing": "packaging-material",
  "machinery-equipment": "industrial-machinery",
};

export function resolveCategorySlug(slug: string): string {
  return ALIASES[slug] ?? slug;
}

/** True for a category with a data-backed page or one of the homepage's top categories. */
export function isKnownCategory(slug: string): boolean {
  return slug in CATEGORY_PAGES || TOP_CATEGORIES.some((category) => category.id === slug);
}
