import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryListingPage } from "@/components/category/CategoryListingPage";
import { SupplierProfileHeader } from "@/components/supplier/SupplierProfileHeader";
import { SupplierProfileTabs } from "@/components/supplier/SupplierProfileTabs";
import { SearchPanel } from "@/components/ui/SearchPanel";
import { PRODUCTS_PAGE_SIZE, getSupplierProductListing, listingHref, listingParams, parseListingQuery } from "@/lib/catalog/categoryListing";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { countPublicCertificationsSafe } from "@/lib/certifications/store";
import { getReviewHeadlineSafe } from "@/lib/reviews/store";
import { siteUrl } from "@/lib/site";
import type { SearchParams } from "@/lib/utils/searchParams";
import { withPagePerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug);
  if (!supplier) return { title: "Supplier not found | Finbyn Mart", robots: { index: false } };

  const query = parseListingQuery(await searchParams);
  const base = siteUrl();
  const path = `${supplier.url}/products`;
  // Search, filters, sort, list view and page size are the same list under another URL: one canonical, kept out of
  // the index. Plain pagination keeps its own canonical so every page of the catalogue can be found.
  const filtered = listingHref(path, query, { page: 1, seller: "" }) !== path;
  const title = `Products from ${supplier.name}, ${supplier.city} | Finbyn Mart`;
  const description = `Browse the ${supplier.productCount} ${supplier.productCount === 1 ? "product" : "products"} of ${supplier.name} in ${supplier.city}, ${supplier.state}. Search, filter, and request a quote on Finbyn Mart.`;
  return {
    title,
    description,
    ...(base ? { alternates: { canonical: query.page > 1 && !filtered ? `${base}${path}?page=${query.page}` : `${base}${path}` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, type: "website", ...(base ? { url: `${base}${path}` } : {}) },
  };
}

async function SupplierProductsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug);
  if (!supplier) notFound();

  // The supplier is the one resolved from this URL. Whatever `seller` the address carries is replaced, never trusted.
  const query = { ...parseListingQuery(await searchParams), seller: "" };
  const listing = getSupplierProductListing(supplier.slug, query, { pageSize: PRODUCTS_PAGE_SIZE });
  if (!listing) notFound();

  const path = `${supplier.url}/products`;
  const [certificationCount, reviewHeadline] = await Promise.all([countPublicCertificationsSafe(supplier.slug), getReviewHeadlineSafe(supplier.slug)]);
  // Facets that cannot vary for one supplier are left out of the sidebar.
  const view = {
    ...listing,
    activeFilters: Math.max(0, listing.activeFilters - 1),
    applied: { ...listing.applied, seller: "" },
    facets: { ...listing.facets, categories: listing.facets.categories.length > 1 ? listing.facets.categories : [], locations: [], cities: [] },
  };

  const requirement = new URLSearchParams({ supplier: supplier.slug });
  if (listing.applied.q) requirement.set("product", listing.applied.q);
  const requirementHref = `/post-requirement?${requirement}`;

  return (
    <CategoryListingPage
      basePath={path}
      query={query}
      listing={view}
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Suppliers", href: "/suppliers" }, { label: supplier.name, href: supplier.url }, { label: "Products" }]}
      name={supplier.name}
      heading={`Products from ${supplier.name}`}
      filtersVariant="global"
      cardInquiry
      hero={
        <>
          <SupplierProfileHeader supplier={supplier} breadcrumbLast="Products" />
          <SupplierProfileTabs url={supplier.url} productCount={supplier.productCount} certificationCount={certificationCount} reviewCount={reviewHeadline?.count} active="products" />
        </>
      }
      search={
        <SearchPanel
          inline
          action={path}
          label="Search Products"
          placeholder={`Search ${supplier.name}'s products by name, category or colour...`}
          value={listing.applied.q}
          hidden={listingParams(listing.applied, { q: "", page: 1, seller: "" })}
        />
      }
      noMatchHint={listing.applied.q ? `None of ${supplier.name}'s products match “${listing.applied.q}”. Try another word, remove a filter, or post your requirement.` : undefined}
      cta={{
        heading: "Need a Custom Solution or Bulk Order?",
        description: `Share your requirements and get a customised quote from ${supplier.name}.`,
        href: requirementHref,
      }}
      requirementHref={requirementHref}
    />
  );
}

export default withPagePerf("page suppliers/:slug/products", SupplierProductsPage);
