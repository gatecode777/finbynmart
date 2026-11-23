import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryListingPage } from "@/components/category/CategoryListingPage";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaTile } from "@/components/ui/MediaTile";
import { SearchPanel } from "@/components/ui/SearchPanel";
import { INDUSTRY_SOLUTIONS } from "@/lib/constants/industries";
import { PAGE_SIZE, getIndustryListing, listingHref, listingParams, parseListingQuery, type CategoryListing } from "@/lib/catalog/categoryListing";
import { resolveIndustryScope } from "@/lib/catalog/industryScope";
import { ensureApproved } from "@/lib/catalog/approvedProducts";
import { siteUrl } from "@/lib/site";
import type { SearchParams } from "@/lib/utils/searchParams";
import styles from "./industry.module.css";
import { withPagePerf } from "@/lib/perf/instrument";

interface IndustryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

const find = (slug: string) => INDUSTRY_SOLUTIONS.find((item) => item.id === slug);

export async function generateMetadata({ params, searchParams }: IndustryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const industry = find(slug);
  if (!industry) return {};
  const base = siteUrl();
  const filtered = listingHref(`/industries/${slug}`, parseListingQuery(await searchParams), { page: 1 }) !== `/industries/${slug}`;
  return {
    title: `${industry.name} | Finbyn Mart`,
    description: `Products from suppliers serving ${industry.name}, with supplier locations and quotation requests.`,
    ...(base ? { alternates: { canonical: `${base}/industries/${slug}` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

async function IndustryPage({ params, searchParams }: IndustryPageProps) {
  const { slug } = await params;
  const industry = find(slug);
  if (!industry) notFound();

  const crumbs = [{ label: "Home", href: "/" }, { label: "Industries", href: "/industries" }, { label: industry.name }];
  const head = (
    <>
      <Breadcrumb items={crumbs} />
      <PageIntro title={industry.name} />
      <div className={styles.banner}>
        <MediaTile tile={industry} alt={industry.name} iconSize={48} />
      </div>
    </>
  );
  const requirement = (
    <Link prefetch={false} href="/post-requirement">Post a requirement</Link>
  );

  await ensureApproved();
  const scope = resolveIndustryScope(industry.id);

  // 1. No approved industry-to-category mapping: say so. The catalogue is never shown as a fallback.
  if (scope.state === "UNMAPPED") {
    return (
      <Container>
        {head}
        <PageBody>
          <EmptyState title="Products for this industry aren't set up yet" actions={<>{requirement}<Link prefetch={false} href="/products">Browse all products</Link></>}>
            Which product categories belong to {industry.name} has not been configured yet, so no products are listed here. You can browse every product or post your requirement and suppliers will respond.
          </EmptyState>
        </PageBody>
      </Container>
    );
  }

  const basePath = `/industries/${industry.id}`;
  const scopeIds = scope.categories.map((c) => c.id);
  // a failed catalogue read is an error with a retry, never a zero-result page
  let listing: CategoryListing | null = null;
  const query = parseListingQuery(await searchParams);
  if (scopeIds.length > 0) {
    try {
      listing = getIndustryListing(scopeIds, query, { pageSize: PAGE_SIZE });
    } catch (error) {
      console.error("industry listing failed", industry.id, (error as Error).message);
    }
  }

  // 2. Approved mapping, but none of its categories is public right now (inactive, or no public products).
  if (scopeIds.length === 0) {
    return (
      <Container>
        {head}
        <PageBody>
          <EmptyState title="No public products in this industry yet" actions={<>{requirement}<Link prefetch={false} href="/products">Browse all products</Link></>}>
            The product categories for {industry.name} currently have no public products. They appear here automatically when suppliers list approved products.
          </EmptyState>
        </PageBody>
      </Container>
    );
  }

  // 3. The catalogue could not be read.
  if (!listing) {
    return (
      <Container>
        {head}
        <PageBody>
          <EmptyState title="Products could not be loaded" actions={<><Link prefetch={false} href={listingHref(basePath, query, { page: 1 })}>Try again</Link>{requirement}</>}>
            Something went wrong while loading products for {industry.name}. This is not an empty result. Please try again.
          </EmptyState>
        </PageBody>
      </Container>
    );
  }

  const applied = listing.applied;
  const chips = scope.categories.map((c) => ({ label: c.name, href: listingHref(basePath, applied, { category: applied.category.includes(c.id) ? applied.category.filter((x) => x !== c.id) : [...applied.category, c.id], page: 1 }), active: applied.category.includes(c.id) }));
  const requirementParams = new URLSearchParams();
  if (applied.q) requirementParams.set("product", applied.q);
  const requirementHref = requirementParams.size ? `/post-requirement?${requirementParams}` : "/post-requirement";

  return (
    <CategoryListingPage
      basePath={basePath}
      query={query}
      listing={listing}
      breadcrumbs={crumbs}
      name={industry.name}
      heading={`${industry.name} Products`}
      filtersVariant="global"
      hero={<Container>{head}</Container>}
      search={<SearchPanel action={basePath} label="Search Products" placeholder={`Search ${industry.name} products`} value={applied.q} hidden={listingParams(applied, { q: "", page: 1 })} />}
      chips={chips}
      chipsLabel="Browse categories"
      chipsAllHref={listingHref(basePath, applied, { category: [], page: 1 })}
      chipsAllLabel="All categories"
      noMatchHint={applied.q ? `Nothing in ${industry.name} matches “${applied.q}”. Check the spelling, remove a filter, or post your requirement and suppliers will respond.` : undefined}
      cta={{ heading: "Need help describing your requirement?", description: "Post your requirement and get quotes from suppliers in minutes.", href: requirementHref }}
      requirementHref={requirementHref}
    />
  );
}

export default withPagePerf("page industries/:slug", IndustryPage);
