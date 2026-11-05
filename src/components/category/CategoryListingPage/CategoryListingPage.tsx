import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { BulkRequirementCta } from "@/components/category/BulkRequirementCta";
import { CategoryDetailHero, type HeroStat } from "@/components/category/CategoryDetailHero";
import { CategoryFilters } from "@/components/category/CategoryFilters";
import { ListingToolbar } from "@/components/category/ListingToolbar";
import { ProductCard } from "@/components/category/ProductCard";
import { SubcategoryChips, type Chip } from "@/components/category/SubcategoryChips";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterDrawer } from "@/components/ui/FilterDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { ResultSummary } from "@/components/ui/ResultSummary";
import type { CategoryListing } from "@/lib/catalog/categoryListing";
import { NO_FILTERS, describeMoq, listingHref, type ListingQuery } from "@/lib/catalog/listingQuery";
import { siteUrl } from "@/lib/site";
import { formatCount } from "@/lib/utils/format";
import type { BreadcrumbItem } from "@/types";
import styles from "./CategoryListingPage.module.css";

export interface CategoryListingPageProps {
  /** Path of this page, e.g. /categories/<slug> or /categories/<slug>/<sub>. */
  basePath: string;
  query: ListingQuery;
  listing: CategoryListing;
  breadcrumbs: BreadcrumbItem[];
  /** Name used in headings and the structured data ("Industrial Machinery", "Compressors", "All"). */
  name: string;
  /** Replaces the category hero (All Products and search pages bring their own). */
  hero?: ReactNode;
  /** Rendered between the hero and the results, e.g. the search panel. */
  search?: ReactNode;
  /** Heading above the results; defaults to "<name> Products". */
  heading?: string;
  /** Word after the count in the heading, e.g. "Products" gives "(3,248 Products)". */
  countLabel?: string;
  /** "global" collapses the filter groups like the All Products reference; "category" keeps them open. */
  filtersVariant?: "category" | "global";
  description?: string;
  iconKey?: string;
  imageSrc?: string;
  imageRemote?: boolean;
  stats?: HeroStat[];
  chips?: Chip[];
  chipsLabel?: string;
  chipsAllHref?: string;
  chipsAllLabel?: string;
  /** Links offered when there are no products (other subcategories or categories). */
  otherTitle?: string;
  others?: { name: string; href: string; count: number }[];
  cta: { heading: string; description: string; href: string };
  /** Cards also offer "Add Inquiry" (supplier product pages). */
  cardInquiry?: boolean;
  /** Name of the supplier when the list is limited to one, for the filter chip. */
  sellerName?: string;
  /** Shown when no products match because of the search text (All Products and search pages). */
  noMatchHint?: ReactNode;
  /** Where a "post a requirement" link from the empty state goes. */
  requirementHref: string;
}

/**
 * The listing page shared by /categories/<slug> (Page 03) and /categories/<slug>/<sub> (Page 04):
 * hero, subcategory row, filter sidebar, toolbar, product grid, pagination, bulk banner, benefits.
 * Routes only choose the data and the wording; the markup lives here once.
 */
export function CategoryListingPage(props: CategoryListingPageProps) {
  const { basePath, query: requested, listing, breadcrumbs, name } = props;
  const chips = props.chips ?? [];
  const others = props.others ?? [];
  // What was actually applied (unknown ids dropped, page clamped) drives every link on the page.
  const query = listing.applied;
  const { totals, facets, results, activeFilters } = listing;

  // An out-of-range page number goes to the last real page.
  if (results.total > 0 && requested.page > results.totalPages) {
    redirect(listingHref(basePath, query, { page: results.totalPages }));
  }

  const hasProducts = totals.products > 0;
  // With nothing matching and no filter to remove, there is nothing to refine, so the sidebar is left out.
  const showFilters = hasProducts && (results.total > 0 || activeFilters > 0);
  const base = siteUrl() ?? "";
  const href = (overrides: Partial<ListingQuery>) => listingHref(basePath, query, { page: 1, ...overrides });

  // Applied-filter chips; each removes just that filter.
  const labelOf = (options: { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value;
  const applied: { key: string; label: string; href: string }[] = [
    ...query.category.map((v) => ({ key: `category-${v}`, label: labelOf(facets.categories, v), href: href({ category: query.category.filter((x) => x !== v) }) })),
    ...query.department.map((v) => ({ key: `department-${v}`, label: `${v} Apparel`, href: href({ department: query.department.filter((x) => x !== v) }) })),
    ...(query.seller ? [{ key: "seller", label: `Supplier: ${props.sellerName ?? query.seller}`, href: href({ seller: "" }) }] : []),
    ...query.city.map((v) => ({ key: `city-${v}`, label: v, href: href({ city: query.city.filter((x) => x !== v) }) })),
    ...query.sub.map((v) => ({ key: `sub-${v}`, label: labelOf(facets.subcategories, v), href: href({ sub: query.sub.filter((x) => x !== v) }) })),
    ...query.type.map((v) => ({ key: `type-${v}`, label: v, href: href({ type: query.type.filter((x) => x !== v) }) })),
    ...query.colour.map((v) => ({ key: `colour-${v}`, label: v, href: href({ colour: query.colour.filter((x) => x !== v) }) })),
    ...query.state.map((v) => ({ key: `state-${v}`, label: v, href: href({ state: query.state.filter((x) => x !== v) }) })),
    ...(query.moq ? [{ key: "moq", label: `MOQ ${describeMoq(query.moq)}`, href: href({ moq: "" }) }] : []),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? [{
          key: "price",
          label: `₹${query.minPrice !== undefined ? formatCount(query.minPrice) : "0"} – ${query.maxPrice !== undefined ? `₹${formatCount(query.maxPrice)}` : "any"}`,
          href: href({ minPrice: undefined, maxPrice: undefined }),
        }]
      : []),
  ];

  // Parameters the sort form carries (everything but sort and page).
  const hidden: [string, string][] = [
    ...(query.q ? [["q", query.q] as [string, string]] : []),
    ...query.category.map((v): [string, string] => ["category", v]),
    ...query.department.map((v): [string, string] => ["department", v]),
    ...query.city.map((v): [string, string] => ["city", v]),
    ...(query.seller ? [["seller", query.seller] as [string, string]] : []),
    ...(query.limit !== undefined ? [["limit", String(query.limit)] as [string, string]] : []),
    ...query.sub.map((v): [string, string] => ["sub", v]),
    ...query.type.map((v): [string, string] => ["type", v]),
    ...query.colour.map((v): [string, string] => ["colour", v]),
    ...query.state.map((v): [string, string] => ["state", v]),
    ...(query.moq ? [["moq", query.moq] as [string, string]] : []),
    ...(query.minPrice !== undefined ? [["minPrice", String(query.minPrice)] as [string, string]] : []),
    ...(query.maxPrice !== undefined ? [["maxPrice", String(query.maxPrice)] as [string, string]] : []),
    ...(query.view === "list" ? [["view", "list"] as [string, string]] : []),
  ];

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: `${base}${item.href ?? basePath}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${name} products`,
      numberOfItems: results.total,
      itemListElement: results.products.map((product, index) => ({
        "@type": "ListItem",
        position: (results.page - 1) * results.pageSize + index + 1,
        name: product.name,
        url: `${base}${product.href}`,
      })),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD built from our own data; "<" is escaped so it can never close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      {props.hero ?? (
        <CategoryDetailHero
          name={name}
          description={props.description ?? ""}
          iconKey={props.iconKey ?? ""}
          imageSrc={props.imageSrc}
          imageRemote={props.imageRemote}
          stats={props.stats ?? []}
          breadcrumbs={breadcrumbs}
        />
      )}

      {props.search}

      {hasProducts && chips.length > 0 && props.chipsLabel && (
        <SubcategoryChips chips={chips} label={props.chipsLabel} allHref={props.chipsAllHref} allLabel={props.chipsAllLabel} />
      )}

      <Container>
        <div className={showFilters ? styles.layout : styles.layoutSingle}>
          {showFilters && (
            <FilterDrawer breakpoint="lg" label="Filter Products" activeCount={activeFilters} showFooter={false}>
              <CategoryFilters basePath={basePath} query={query} facets={facets} activeFilters={activeFilters} variant={props.filtersVariant} />
            </FilterDrawer>
          )}

          <section className={styles.main} aria-labelledby="listing-heading">
            {hasProducts ? (
              <>
                <div className={styles.header}>
                  <h2 id="listing-heading" className={styles.title}>
                    {props.heading ?? `${name} Products`} <span className={styles.titleCount}>({formatCount(results.total)}{props.countLabel ? ` ${props.countLabel}` : ""})</span>
                  </h2>
                  <ListingToolbar
                    action={basePath}
                    hidden={hidden}
                    sort={query.sort}
                    view={query.view}
                    gridHref={listingHref(basePath, query, { view: "grid", page: results.page })}
                    listHref={listingHref(basePath, query, { view: "list", page: results.page })}
                  />
                </div>

                {listing.ignored.length > 0 && (
                  <p className={styles.notice} role="status">
                    Some filters in this link were not recognised and were ignored:{" "}
                    {listing.ignored.map((item) => `${item.param} "${item.value}"`).join(", ")}.
                  </p>
                )}

                {applied.length > 0 && (
                  <ul className={styles.applied} aria-label="Applied filters">
                    {applied.map((item) => (
                      <li key={item.key}>
                        <Link href={item.href} className={styles.appliedChip} aria-label={`Remove filter ${item.label}`}>
                          {item.label}
                          <X size={14} strokeWidth={2.25} aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {results.total === 0 ? (
                  <EmptyState
                    title="No products match these filters"
                    actions={
                      <>
                        {query.q && (
                          <Link href={href({ q: "" })} className={styles.emptyLink}>
                            Clear search
                          </Link>
                        )}
                        <Link href={href(NO_FILTERS)} className={styles.emptyLink}>
                          Clear all filters
                        </Link>
                      </>
                    }
                  >
                    {props.noMatchHint ?? "Try removing a filter or widening the price range."}
                  </EmptyState>
                ) : (
                  <>
                    <ul className={query.view === "list" ? styles.list : props.cardInquiry ? `${styles.grid} ${styles.gridWide}` : styles.grid}>
                      {results.products.map((product) => (
                        <li key={product.id}>
                          <ProductCard product={product} view={query.view} inquiry={props.cardInquiry} />
                        </li>
                      ))}
                    </ul>

                    <div className={styles.footer}>
                      <ResultSummary page={results.page} pageSize={results.pageSize} total={results.total} noun="products" />
                      <Pagination
                        page={results.page}
                        totalPages={results.totalPages}
                        basePath={basePath}
                        params={{
                          q: query.q || undefined,
                          category: query.category,
                          department: query.department,
                          seller: query.seller || undefined,
                          city: query.city,
                          limit: query.limit !== undefined ? String(query.limit) : undefined,
                          sub: query.sub,
                          type: query.type,
                          colour: query.colour,
                          state: query.state,
                          moq: query.moq || undefined,
                          minPrice: query.minPrice !== undefined ? String(query.minPrice) : undefined,
                          maxPrice: query.maxPrice !== undefined ? String(query.maxPrice) : undefined,
                          sort: query.sort !== "relevance" ? query.sort : undefined,
                          view: query.view === "list" ? "list" : undefined,
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h2 id="listing-heading" className="visually-hidden">
                  {name} products
                </h2>
                <EmptyState
                  title={`No products in ${name} yet`}
                  actions={
                    <>
                      <Link href={props.requirementHref} className={styles.emptyLink}>
                        Post a requirement
                      </Link>
                      <Link href="/categories" className={styles.emptyLink}>
                        Browse all categories
                      </Link>
                    </>
                  }
                >
                  Suppliers have not listed products here yet. Post what you need and we will let you know what comes in, or look at one of the options below.
                </EmptyState>
                {others.length > 0 && (
                  <nav className={styles.others} aria-label={props.otherTitle ?? "Other categories"}>
                    <h3 className={styles.othersTitle}>{props.otherTitle ?? "Other categories"}</h3>
                    <ul className={styles.othersList}>
                      {others.map((node) => (
                        <li key={node.href}>
                          <Link href={node.href} className={styles.otherLink}>
                            {node.name} <span className={styles.otherCount}>({formatCount(node.count)})</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
              </>
            )}
          </section>
        </div>
      </Container>

      <BulkRequirementCta heading={props.cta.heading} description={props.cta.description} href={props.cta.href} />
      <div className={styles.benefits}>
        <TrustBenefits overlap={false} />
      </div>
    </>
  );
}
