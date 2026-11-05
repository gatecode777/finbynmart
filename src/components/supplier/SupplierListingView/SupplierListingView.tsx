import Link from "next/link";
import { redirect } from "next/navigation";
import { X } from "lucide-react";
import { BulkRequirementCta } from "@/components/category/BulkRequirementCta";
import { ListingToolbar } from "@/components/category/ListingToolbar";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { SupplierFilters } from "@/components/supplier/SupplierFilters";
import { SupplierListCard } from "@/components/supplier/SupplierListCard";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterDrawer } from "@/components/ui/FilterDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { ResultSummary } from "@/components/ui/ResultSummary";
import { siteUrl } from "@/lib/site";
import type { SupplierListing } from "@/lib/catalog/supplierListing";
import { NO_SUPPLIER_FILTERS, SUPPLIER_SORT_OPTIONS, supplierHref, supplierParams, type SupplierQuery } from "@/lib/catalog/supplierQuery";
import { formatCount } from "@/lib/utils/format";
import type { ReactNode } from "react";
import styles from "./SupplierListingView.module.css";

interface SupplierListingViewProps {
  basePath: string;
  query: SupplierQuery;
  listing: SupplierListing;
  hero: ReactNode;
  search: ReactNode;
  requirementHref: string;
}

/** The supplier directory below the hero: filters, toolbar, applied filters, cards, pagination and the requirement banner. */
export function SupplierListingView({ basePath, query: requested, listing, hero, search, requirementHref }: SupplierListingViewProps) {
  const { results, facets, applied: query, activeFilters, totals } = listing;

  // An out-of-range page number goes to the last real page.
  if (results.total > 0 && requested.page > results.totalPages) redirect(supplierHref(basePath, query, { page: results.totalPages }));

  const href = (overrides: Partial<SupplierQuery>) => supplierHref(basePath, query, { page: 1, ...overrides });
  const labelOf = (options: { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value;
  const applied = [
    ...query.industry.map((v) => ({ key: `industry-${v}`, label: v, href: href({ industry: query.industry.filter((x) => x !== v) }) })),
    ...query.category.map((v) => ({ key: `category-${v}`, label: labelOf(facets.categories, v), href: href({ category: query.category.filter((x) => x !== v) }) })),
    ...query.state.map((v) => ({ key: `state-${v}`, label: v, href: href({ state: query.state.filter((x) => x !== v) }) })),
    ...query.city.map((v) => ({ key: `city-${v}`, label: v, href: href({ city: query.city.filter((x) => x !== v) }) })),
    ...query.verification.map((v) => ({ key: `verification-${v}`, label: v === "verified" ? "Verified" : "Not verified", href: href({ verification: query.verification.filter((x) => x !== v) }) })),
  ];
  const hidden = supplierParams(query, { sort: "relevance", page: 1, view: "grid" }).filter(([name]) => name !== "sort");
  const pageParams: Record<string, string | string[] | undefined> = {
    q: query.q || undefined,
    industry: query.industry,
    state: query.state,
    city: query.city,
    category: query.category,
    verification: query.verification,
    sort: query.sort !== "relevance" ? query.sort : undefined,
    view: query.view === "list" ? "list" : undefined,
    limit: query.limit !== undefined ? String(query.limit) : undefined,
  };
  const base = siteUrl() ?? "";

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: "Suppliers", item: `${base}${basePath}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Suppliers",
      numberOfItems: results.total,
      itemListElement: results.items.map((s, i) => ({ "@type": "ListItem", position: (results.page - 1) * results.pageSize + i + 1, name: s.name, url: `${base}${s.url}` })),
    },
  ];

  const showFilters = totals.suppliers > 0 && (results.total > 0 || activeFilters > 0);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {hero}
      {search}

      <Container>
        <div className={showFilters ? styles.layout : styles.layoutSingle}>
          {showFilters && (
            <FilterDrawer breakpoint="lg" label="Filter Suppliers" activeCount={activeFilters} showFooter={false}>
              <SupplierFilters basePath={basePath} query={query} facets={facets} activeFilters={activeFilters} />
            </FilterDrawer>
          )}

          <section className={styles.main} aria-labelledby="listing-heading">
            <div className={styles.header}>
              <h2 id="listing-heading" className={styles.title}>
                All Suppliers <span className={styles.titleCount}>({formatCount(results.total)})</span>
              </h2>
              <ListingToolbar
                action={basePath}
                hidden={hidden}
                sort={query.sort}
                sortOptions={SUPPLIER_SORT_OPTIONS}
                view={query.view}
                gridHref={supplierHref(basePath, query, { view: "grid", page: results.page })}
                listHref={supplierHref(basePath, query, { view: "list", page: results.page })}
              />
            </div>

            {listing.ignored.length > 0 && (
              <p className={styles.notice} role="status">
                Some filters in this link were not recognised and were ignored: {listing.ignored.map((item) => `${item.param} "${item.value}"`).join(", ")}.
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
                title="No suppliers match"
                actions={
                  <>
                    {query.q && (
                      <Link href={href({ q: "" })} className={styles.emptyLink}>
                        Clear search
                      </Link>
                    )}
                    {activeFilters > 0 && (
                      <Link href={href(NO_SUPPLIER_FILTERS)} className={styles.emptyLink}>
                        Clear all filters
                      </Link>
                    )}
                    <Link href={requirementHref} className={styles.emptyLink}>
                      Post your requirement
                    </Link>
                  </>
                }
              >
                {query.q
                  ? `No suppliers match “${query.q}”${activeFilters > 0 ? " with these filters" : ""}. Check the spelling, try a product, category or place, or post your requirement.`
                  : "Try removing a filter."}
              </EmptyState>
            ) : (
              <>
                <ul className={query.view === "list" ? styles.list : styles.grid}>
                  {results.items.map((supplier) => (
                    <li key={supplier.id}>
                      <SupplierListCard supplier={supplier} view={query.view} />
                    </li>
                  ))}
                </ul>
                <div className={styles.footer}>
                  <ResultSummary page={results.page} pageSize={results.pageSize} total={results.total} noun="suppliers" />
                  <Pagination
                    page={results.page}
                    totalPages={results.totalPages}
                    basePath={basePath}
                    params={pageParams}
                  />
                </div>
              </>
            )}
          </section>
        </div>
      </Container>

      <BulkRequirementCta heading="Looking for Specific Suppliers?" description="Post your requirement and get quotes from suppliers." href={requirementHref} />
      <div className={styles.benefits}>
        <TrustBenefits overlap={false} />
      </div>
    </>
  );
}
