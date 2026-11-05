import { TOP_CATEGORIES } from "@/lib/constants/categories";
import { resolveCategorySlug } from "@/lib/constants/categoryAliases";
import { getCategoryPage } from "@/lib/constants/categoryPages";
import type { CategoryDirectory, CategoryNode } from "@/types";
import { getCatalog } from "./data";
import { slugify } from "./slug";

/**
 * Server-only. Builds the public category directory shown on /categories.
 *
 * Sources (no category record is invented):
 *  - Main categories are the curated homepage categories (TOP_CATEGORIES), with their approved images.
 *  - Sample B2B listings (categoryPages.ts) back every main category except Apparel & Fashion.
 *  - The product catalog (db/seed, apparel only) backs Apparel & Fashion and supplies its
 *    departments (Men, Women, ...) and product categories (Men Tshirts, ...).
 *
 * Availability rules: a category is public only when it is active and has at least one eligible
 * product, or has an eligible child. Nothing is written or mutated; ineligible categories are
 * simply left out, and they appear automatically once products exist.
 *
 * Counts: computed once per server process in a single pass over the catalog (not per request),
 * each product counted once per level. A card's count equals what its destination page lists.
 */
const CATALOG_MAIN_ID = "apparel-fashion";

const globalForDirectory = globalThis as unknown as { __finbynCategoriesV2?: CategoryDirectory };

export function getCategoryDirectory(): CategoryDirectory {
  globalForDirectory.__finbynCategoriesV2 ??= build();
  return globalForDirectory.__finbynCategoriesV2;
}

export function getCategoryNode(id: string): CategoryNode | undefined {
  return getCategoryDirectory().nodes.find((node) => node.id === id);
}

function build(): CategoryDirectory {
  const { products, sellers } = getCatalog();

  // One pass over the catalog.
  const byDepartment = new Map<string, { count: number; image: string; categories: Map<string, { count: number; image: string }> }>();
  for (const p of products) {
    let dept = byDepartment.get(p.department);
    if (!dept) {
      dept = { count: 0, image: p.imageUrl, categories: new Map() };
      byDepartment.set(p.department, dept);
    }
    dept.count += 1;
    const category = dept.categories.get(p.categoryName);
    if (category) category.count += 1;
    else dept.categories.set(p.categoryName, { count: 1, image: p.imageUrl });
  }

  const nodes: CategoryNode[] = [];
  const addedSubcategories: CategoryNode[] = [];

  for (const top of TOP_CATEGORIES) {
    const page = getCategoryPage(resolveCategorySlug(top.id));
    const isCatalogMain = top.id === CATALOG_MAIN_ID;
    const productCount = isCatalogMain ? products.length : (page?.products.length ?? 0);

    const main: CategoryNode = {
      id: top.id,
      name: top.name,
      slug: top.id,
      description: isCatalogMain
        ? `${products.length.toLocaleString("en-IN")} apparel products from ${sellers.filter((s) => s.productCount > 0).length.toLocaleString("en-IN")} suppliers.`
        : (page?.description ?? ""),
      parentId: null,
      childIds: [],
      productCount,
      href: `/categories/${top.id}`,
      isActive: true,
      imageSrc: top.imageSrc,
      imageAlt: `${top.name} products`,
      iconKey: top.id,
      source: isCatalogMain ? "catalog" : "curated",
    };

    if (isCatalogMain) {
      const departments = [...byDepartment.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
      for (const [department, info] of departments) {
        const deptId = `${main.id}/${slugify(department)}`;
        const deptNode: CategoryNode = {
          id: deptId,
          name: `${department} Apparel`,
          slug: slugify(department),
          description: `${info.count.toLocaleString("en-IN")} ${department.toLowerCase()} apparel products across ${info.categories.size} categories.`,
          parentId: main.id,
          childIds: [],
          productCount: info.count,
          href: `/products?department=${encodeURIComponent(department)}`,
          isActive: true,
          imageSrc: info.image,
          imageRemote: true,
          imageAlt: `${department} apparel`,
          source: "catalog",
        };
        const categories = [...info.categories.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
        for (const [name, c] of categories) {
          const leaf: CategoryNode = {
            id: `${deptId}/${slugify(name)}`,
            name,
            slug: slugify(name),
            description: `${c.count.toLocaleString("en-IN")} ${name} products.`,
            parentId: deptId,
            childIds: [],
            productCount: c.count,
            href: `/categories/${main.id}/${slugify(name)}`,
            isActive: true,
            imageSrc: c.image,
            imageRemote: true,
            imageAlt: name,
            source: "catalog",
          };
          deptNode.childIds.push(leaf.id);
          addedSubcategories.push(leaf);
        }
        main.childIds.push(deptNode.id);
        addedSubcategories.push(deptNode);
      }
    }

    // Availability: no eligible products and no eligible children means not publicly discoverable.
    if (main.isActive && (main.productCount > 0 || main.childIds.length > 0)) nodes.push(main);
  }

  nodes.push(...addedSubcategories.filter((node) => nodes.some((m) => m.id === node.parentId?.split("/")[0])));

  const mains = nodes.filter((n) => n.parentId === null);
  return {
    nodes,
    totals: {
      mainCategories: mains.length,
      subcategories: nodes.length - mains.length,
      // Mains partition the products, so summing them counts every product once.
      products: mains.reduce((sum, n) => sum + n.productCount, 0),
    },
  };
}

/** A curated category as the detail page needs it. Exists even when it has no eligible products. */
export interface CategoryRecord {
  id: string;
  name: string;
  description: string;
  imageSrc?: string;
  iconKey: string;
  /** "catalog" = backed by the apparel product catalog; "sample" = backed by sample B2B listings. */
  source: "catalog" | "sample";
  /** Key of the sample dataset in categoryPages.ts, when one exists. */
  samplePageSlug?: string;
}

export function getCategoryRecord(slug: string): CategoryRecord | undefined {
  const top = TOP_CATEGORIES.find((category) => category.id === slug);
  if (!top) return undefined;
  const isCatalog = top.id === CATALOG_MAIN_ID;
  const samplePageSlug = resolveCategorySlug(top.id);
  const page = getCategoryPage(samplePageSlug);
  const { products, sellers } = getCatalog();

  let description: string;
  if (isCatalog) {
    description = `Browse ${products.length.toLocaleString("en-IN")} apparel products from ${sellers.filter((s) => s.productCount > 0).length.toLocaleString("en-IN")} suppliers across men’s, women’s, boys’, girls’ and unisex categories. Compare prices and request quotes.`;
  } else if (page) {
    description = page.description;
  } else {
    description = `Suppliers and products in ${top.name} will appear here as soon as they are listed on Finbyn Mart.`;
  }

  return {
    id: top.id,
    name: top.name,
    description,
    imageSrc: top.imageSrc,
    iconKey: top.id,
    source: isCatalog ? "catalog" : "sample",
    samplePageSlug: !isCatalog && page ? samplePageSlug : undefined,
  };
}

/** Legacy and navigation slugs that point at a canonical category (or at the all-categories page). */
const SLUG_REDIRECTS: Record<string, string> = {
  "machinery-equipment": "industrial-machinery",
  "packaging-material": "packaging-printing",
};

/** The canonical /categories/<slug> for a legacy or sample-dataset slug. */
export function canonicalCategorySlug(slug: string): string {
  return SLUG_REDIRECTS[slug] ?? slug;
}

export function resolveCategoryRoute(slug: string): { type: "category" | "redirect" | "all" | "none"; slug?: string } {
  if (slug === "industrial-supplies" || slug === "more") return { type: "all" };
  const canonical = SLUG_REDIRECTS[slug] ?? slug;
  if (!getCategoryRecord(canonical)) return { type: "none" };
  return canonical === slug ? { type: "category", slug } : { type: "redirect", slug: canonical };
}
