import type { Metadata } from "next";
import { Building2, Factory, MapPin } from "lucide-react";
import { SupplierListingView } from "@/components/supplier/SupplierListingView";
import { PageHero } from "@/components/ui/PageHero";
import { SearchPanel } from "@/components/ui/SearchPanel";
import { getSupplierListing, parseSupplierQuery, supplierHref, supplierParams, SUPPLIER_PAGE_SIZE } from "@/lib/catalog/supplierListing";
import { siteUrl } from "@/lib/site";
import type { SearchParams } from "@/lib/utils/searchParams";
import { withPagePerf } from "@/lib/perf/instrument";

const TITLE = "Find Suppliers | Finbyn Mart";
const DESCRIPTION = "Browse suppliers on Finbyn Mart by company name, product, category or location, and send an inquiry or post your requirement.";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const query = parseSupplierQuery(await searchParams);
  const base = siteUrl();
  // Search, filters, sort, list view and page size are the same directory under another URL: one canonical, kept out
  // of the index. Plain pagination keeps its own canonical so every page of suppliers can be found.
  const filtered = supplierHref("/suppliers", query, { page: 1 }) !== "/suppliers";
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(base ? { alternates: { canonical: query.page > 1 && !filtered ? `${base}/suppliers?page=${query.page}` : `${base}/suppliers` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", ...(base ? { url: `${base}/suppliers` } : {}) },
  };
}

async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseSupplierQuery(await searchParams);
  const listing = getSupplierListing(query, { pageSize: SUPPLIER_PAGE_SIZE });
  const { totals, applied } = listing;

  const requirement = new URLSearchParams();
  if (applied.q) requirement.set("product", applied.q);
  const requirementHref = requirement.size ? `/post-requirement?${requirement}` : "/post-requirement";
  const breadcrumbs = [{ label: "Home", href: "/" }, { label: "Suppliers" }];

  return (
    <SupplierListingView
      basePath="/suppliers"
      query={query}
      listing={listing}
      requirementHref={requirementHref}
      hero={
        <PageHero
          breadcrumbs={breadcrumbs}
          eyebrow="Discover Suppliers"
          accent="Suppliers"
          headingId="suppliers-heading"
          description="Connect with suppliers across multiple industries and find the right business for your needs."
          stats={[
            { label: totals.suppliers === 1 ? "Supplier" : "Suppliers", value: totals.suppliers, icon: Building2 },
            { label: totals.industries === 1 ? "Industry" : "Industries", value: totals.industries, icon: Factory },
            { label: totals.cities === 1 ? "City" : "Cities", value: totals.cities, icon: MapPin },
          ]}
          image={{ src: "/images/industries/manufacturing.jpg", alt: "A manufacturing workshop" }}
        />
      }
      search={
        <SearchPanel
          action="/suppliers"
          label="Search Suppliers"
          placeholder="Enter company name, product, category or location (e.g. Ruchi House, Sarees, Mumbai...)"
          value={applied.q}
          hidden={supplierParams(applied, { q: "", page: 1 })}
        />
      }
    />
  );
}

export default withPagePerf("page suppliers", SuppliersPage);
