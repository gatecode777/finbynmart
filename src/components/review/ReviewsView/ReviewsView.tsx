import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, MessageSquareText, ShieldCheck, X } from "lucide-react";
import { ReviewCard } from "@/components/review/ReviewCard";
import { ReviewFilters } from "@/components/review/ReviewFilters";
import { ReviewSummary } from "@/components/review/ReviewSummary";
import { WriteReviewPanel } from "@/components/review/WriteReviewPanel";
import { ListingToolbar } from "@/components/category/ListingToolbar";
import { SupplierProfileHeader } from "@/components/supplier/SupplierProfileHeader";
import { SupplierProfileTabs } from "@/components/supplier/SupplierProfileTabs";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterDrawer } from "@/components/ui/FilterDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { ResultSummary } from "@/components/ui/ResultSummary";
import type { SupplierDetail } from "@/lib/catalog/supplierDetail";
import type { ReviewView } from "@/lib/reviews/engine";
import { NO_REVIEW_FILTERS, REVIEW_RANGES, REVIEW_SORTS, reviewHref, type ReviewQuery } from "@/lib/reviews/query";
import type { OwnReview } from "@/lib/reviews/types";
import { siteUrl } from "@/lib/site";
import { formatCount } from "@/lib/utils/format";
import listing from "@/components/category/CategoryListingPage/CategoryListingPage.module.css";
import styles from "./ReviewsView.module.css";

interface ReviewsViewProps {
  supplier: SupplierDetail;
  /** Path of this page: /suppliers/<slug>/reviews. */
  basePath: string;
  view: ReviewView;
  /** The page asked for (an out-of-range page number goes to the last real page). */
  requestedPage: number;
  certificationCount?: number;
  viewer: "guest" | "supplier" | "buyer";
  existing: OwnReview | null;
}

const GUIDELINES = [
  "Share your genuine experience",
  "Review only products or services you actually used",
  "Keep your feedback relevant to the supplier",
  "No abusive language, spam or promotional content",
  "Do not post email addresses, phone numbers or links",
  "Your review is checked by a moderator before it is published",
];

/**
 * Page 12: the supplier header and tabs, the rating summary, the filter sidebar, the sorted and paged published
 * reviews, the Write a Review panel and the guidelines. Everything shown comes from the supplier's published reviews:
 * a supplier with none gets an honest empty state, never placeholder reviews or an invented rating.
 */
export function ReviewsView({ supplier, basePath, view, requestedPage, certificationCount, viewer, existing }: ReviewsViewProps) {
  const { summary, metrics, facets, results, applied: query, activeFilters } = view;
  if (results.total > 0 && requestedPage > results.totalPages) redirect(reviewHref(basePath, query, { page: results.totalPages }));

  const hasAny = summary.total > 0;
  const href = (overrides: Partial<ReviewQuery>) => reviewHref(basePath, query, { page: 1, ...overrides });
  const base = siteUrl() ?? "";

  const chips = [
    ...query.rating.map((value) => ({ key: `rating-${value}`, label: `${value} Star`, href: href({ rating: query.rating.filter((item) => item !== value) }) })),
    ...query.category.map((value) => ({ key: `category-${value}`, label: facets.category.find((option) => option.value === value)?.label ?? value, href: href({ category: query.category.filter((item) => item !== value) }) })),
    ...(query.verified ? [{ key: "verified", label: "Verified Buyer", href: href({ verified: false }) }] : []),
    ...(query.range ? [{ key: "range", label: REVIEW_RANGES.find((option) => option.value === query.range)?.label ?? query.range, href: href({ range: "" }) }] : []),
  ];

  const hidden: [string, string][] = [
    ...query.rating.map((value): [string, string] => ["rating", String(value)]),
    ...query.category.map((value): [string, string] => ["category", value]),
    ...(query.verified ? [["verified", "1"] as [string, string]] : []),
    ...(query.range ? [["range", query.range] as [string, string]] : []),
    ...(query.limit !== undefined ? [["limit", String(query.limit)] as [string, string]] : []),
  ];

  // Structured data carries the breadcrumb only: no aggregate rating or review markup (no review data is marked up).
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", path: "/" },
      { name: "Suppliers", path: "/suppliers" },
      { name: supplier.name, path: supplier.url },
      { name: "Reviews", path: basePath },
    ].map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${base}${item.path}` })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }} />

      <SupplierProfileHeader supplier={supplier} breadcrumbLast="Reviews" rating={hasAny && summary.average !== null ? { average: summary.average, count: summary.total } : undefined} />
      <SupplierProfileTabs url={supplier.url} productCount={supplier.productCount} certificationCount={certificationCount} reviewCount={summary.total} active="reviews" />

      <Container>
        <div className={styles.intro}>
          <span className={styles.introIcon} aria-hidden>
            <MessageSquareText size={40} strokeWidth={1.5} />
          </span>
          <div>
            <h2 className={styles.introTitle}>Customer Reviews &amp; Ratings</h2>
            <p className={styles.introText}>Feedback from buyers about {supplier.name}. Reviews are checked by a moderator before they are published.</p>
          </div>
        </div>

        <ReviewSummary summary={summary} metrics={metrics} />

        <div className={hasAny ? styles.layout : styles.layoutSingle}>
          <div className={styles.write}>
            <WriteReviewPanel supplierSlug={supplier.slug} supplierName={supplier.name} viewer={viewer} existing={existing} />
          </div>

          {hasAny && (
            <div className={styles.filters}>
              <FilterDrawer breakpoint="lg" label="Filter Reviews" activeCount={activeFilters} showFooter={false}>
                <ReviewFilters basePath={basePath} query={query} facets={facets} activeFilters={activeFilters} />
              </FilterDrawer>
            </div>
          )}

          <section className={styles.main} aria-labelledby="reviews-heading">
            {hasAny ? (
              <>
                <div className={listing.header}>
                  <h2 id="reviews-heading" className={listing.title}>
                    Reviews <span className={listing.titleCount}>({formatCount(results.total)})</span>
                  </h2>
                  <ListingToolbar action={basePath} hidden={hidden} sort={query.sort} sortOptions={REVIEW_SORTS} />
                </div>

                {view.ignored.length > 0 && (
                  <p className={listing.notice} role="status">
                    Some filters in this link do not apply to this supplier and were ignored: {view.ignored.map((item) => `${item.param} "${item.value}"`).join(", ")}.
                  </p>
                )}

                {chips.length > 0 && (
                  <ul className={listing.applied} aria-label="Applied filters">
                    {chips.map((chip) => (
                      <li key={chip.key}>
                        <Link href={chip.href} className={listing.appliedChip} aria-label={`Remove filter ${chip.label}`}>
                          {chip.label}
                          <X size={14} strokeWidth={2.25} aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {results.total === 0 ? (
                  <EmptyState
                    title="No reviews match these filters"
                    actions={
                      <Link href={href(NO_REVIEW_FILTERS)} className={listing.emptyLink}>
                        Clear all filters
                      </Link>
                    }
                  >
                    Try removing a filter to see the other reviews of this supplier.
                  </EmptyState>
                ) : (
                  <>
                    <ul className={styles.list}>
                      {results.items.map((review) => (
                        <li key={review.id}>
                          <ReviewCard review={review} />
                        </li>
                      ))}
                    </ul>
                    <div className={listing.footer}>
                      <ResultSummary page={results.page} pageSize={results.pageSize} total={results.total} noun="reviews" />
                      <Pagination
                        page={results.page}
                        totalPages={results.totalPages}
                        basePath={basePath}
                        params={{
                          rating: query.rating.map(String),
                          category: query.category,
                          verified: query.verified ? "1" : undefined,
                          range: query.range || undefined,
                          limit: query.limit !== undefined ? String(query.limit) : undefined,
                          sort: query.sort !== "relevant" ? query.sort : undefined,
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h2 id="reviews-heading" className="visually-hidden">
                  Reviews
                </h2>
                <EmptyState title="No published reviews yet">
                  {supplier.name} has no published reviews. Reviews appear here once a moderator has approved them.
                </EmptyState>
              </>
            )}
          </section>

          <aside className={styles.guide} aria-labelledby="guidelines-heading">
            <h2 id="guidelines-heading" className={styles.guideTitle}>
              <ShieldCheck size={20} strokeWidth={1.75} aria-hidden />
              Review Guidelines
            </h2>
            <ul className={styles.guideList}>
              {GUIDELINES.map((item) => (
                <li key={item}>
                  <Check size={16} strokeWidth={2.5} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </Container>
      <div className={styles.after} />
    </>
  );
}
