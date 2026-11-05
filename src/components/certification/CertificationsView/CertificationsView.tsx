import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, ShieldCheck, X } from "lucide-react";
import { CertificationCard } from "@/components/certification/CertificationCard";
import { CertificationFilters } from "@/components/certification/CertificationFilters";
import { CertificationStats } from "@/components/certification/CertificationStats";
import { BulkRequirementCta } from "@/components/category/BulkRequirementCta";
import { ListingToolbar } from "@/components/category/ListingToolbar";
import { SupplierProfileHeader } from "@/components/supplier/SupplierProfileHeader";
import { SupplierProfileTabs } from "@/components/supplier/SupplierProfileTabs";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterDrawer } from "@/components/ui/FilterDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { ResultSummary } from "@/components/ui/ResultSummary";
import type { SupplierDetail } from "@/lib/catalog/supplierDetail";
import type { CertificationView } from "@/lib/certifications/engine";
import { CERT_SORTS, NO_CERT_FILTERS, certificationHref, type CertificationQuery } from "@/lib/certifications/query";
import { siteUrl } from "@/lib/site";
import { formatCount } from "@/lib/utils/format";
import listing from "@/components/category/CategoryListingPage/CategoryListingPage.module.css";
import styles from "./CertificationsView.module.css";

interface CertificationsViewProps {
  supplier: SupplierDetail;
  /** Path of this page: /suppliers/<slug>/certifications. */
  basePath: string;
  view: CertificationView;
  /** The page asked for (an out-of-range page number goes to the last real page). */
  requestedPage: number;
  /** Published reviews, for the Reviews tab label, when known. */
  reviewCount?: number;
}

/**
 * Page 11: the supplier header and tabs, the four statistics, the filter sidebar, the sort, the certification cards,
 * pagination and the requirement banner. Everything shown comes from the supplier's approved records; a supplier
 * with none gets an honest empty state, never placeholder cards.
 */
export function CertificationsView({ supplier, basePath, view, requestedPage, reviewCount }: CertificationsViewProps) {
  const { stats, facets, results, applied: query, activeFilters } = view;
  if (results.total > 0 && requestedPage > results.totalPages) redirect(certificationHref(basePath, query, { page: results.totalPages }));

  const hasAny = stats.total > 0;
  const href = (overrides: Partial<CertificationQuery>) => certificationHref(basePath, query, { page: 1, ...overrides });
  const requirementHref = `/post-requirement?supplier=${encodeURIComponent(supplier.slug)}`;
  const base = siteUrl() ?? "";

  const label = (group: keyof CertificationView["facets"], value: string) => facets[group].find((option) => option.value.toLowerCase() === value.toLowerCase())?.label ?? value;
  const chips = (["status", "type", "authority", "expiry"] as const).flatMap((group) =>
    query[group].map((value) => ({ key: `${group}-${value}`, label: label(group, value), href: href({ [group]: query[group].filter((item) => item !== value) }) })),
  );

  const hidden: [string, string][] = [
    ...query.status.map((value): [string, string] => ["status", value]),
    ...query.type.map((value): [string, string] => ["type", value]),
    ...query.authority.map((value): [string, string] => ["authority", value]),
    ...query.expiry.map((value): [string, string] => ["expiry", value]),
    ...(query.limit !== undefined ? [["limit", String(query.limit)] as [string, string]] : []),
  ];

  // Structured data carries the breadcrumb only: certification claims are not marked up.
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", path: "/" },
      { name: "Suppliers", path: "/suppliers" },
      { name: supplier.name, path: supplier.url },
      { name: "Certifications", path: basePath },
    ].map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${base}${item.path}` })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }} />

      <SupplierProfileHeader supplier={supplier} breadcrumbLast="Certifications" />
      <SupplierProfileTabs url={supplier.url} productCount={supplier.productCount} certificationCount={stats.total} reviewCount={reviewCount} active="certifications" />

      <Container>
        <div className={styles.intro}>
          <span className={styles.introIcon} aria-hidden>
            <Award size={40} strokeWidth={1.5} />
          </span>
          <div>
            <h2 className={styles.introTitle}>Company Certifications</h2>
            <p className={styles.introText}>Certifications and compliance documents published by {supplier.name}, with their status and validity.</p>
          </div>
        </div>

        <CertificationStats stats={stats} />

        <div className={hasAny ? listing.layout : listing.layoutSingle}>
          {hasAny && (
            <FilterDrawer breakpoint="lg" label="Filter Certifications" activeCount={activeFilters} showFooter={false}>
              <CertificationFilters basePath={basePath} query={query} facets={facets} activeFilters={activeFilters} />
            </FilterDrawer>
          )}

          <section className={listing.main} aria-labelledby="certifications-heading">
            {hasAny ? (
              <>
                <div className={listing.header}>
                  <h2 id="certifications-heading" className={listing.title}>
                    Certifications <span className={listing.titleCount}>({formatCount(results.total)} {results.total === 1 ? "Result" : "Results"})</span>
                  </h2>
                  <ListingToolbar action={basePath} hidden={hidden} sort={query.sort} sortOptions={CERT_SORTS} />
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
                    title="No certifications match these filters"
                    actions={
                      <Link href={href(NO_CERT_FILTERS)} className={listing.emptyLink}>
                        Clear all filters
                      </Link>
                    }
                  >
                    Try removing a filter to see the other certifications of this supplier.
                  </EmptyState>
                ) : (
                  <>
                    <ul className={styles.grid}>
                      {results.items.map((item) => (
                        <li key={item.id}>
                          <CertificationCard certification={item} />
                        </li>
                      ))}
                    </ul>
                    <div className={listing.footer}>
                      <ResultSummary page={results.page} pageSize={results.pageSize} total={results.total} noun="certifications" />
                      <Pagination
                        page={results.page}
                        totalPages={results.totalPages}
                        basePath={basePath}
                        params={{
                          status: query.status,
                          type: query.type,
                          authority: query.authority,
                          expiry: query.expiry,
                          limit: query.limit !== undefined ? String(query.limit) : undefined,
                          sort: query.sort !== "newest" ? query.sort : undefined,
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h2 id="certifications-heading" className="visually-hidden">
                  Certifications
                </h2>
                <EmptyState
                  title="No certifications published yet"
                  actions={
                    <>
                      <Link href={requirementHref} className={listing.emptyLink}>
                        Send Your Requirement
                      </Link>
                      <Link href={supplier.url} className={listing.emptyLink}>
                        Back to supplier profile
                      </Link>
                    </>
                  }
                >
                  {supplier.name} has not published any approved certifications on Finbyn Mart. You can ask for certificates and test reports in your requirement.
                </EmptyState>
              </>
            )}
          </section>
        </div>
      </Container>

      <BulkRequirementCta
        heading="Quality and Compliance"
        description={`Check each certificate's status and validity, then tell ${supplier.name} what you need.`}
        href={requirementHref}
        label="Send Your Requirement"
        icon={<ShieldCheck size={40} strokeWidth={1.5} />}
      />
      <div className={styles.after} />
    </>
  );
}
