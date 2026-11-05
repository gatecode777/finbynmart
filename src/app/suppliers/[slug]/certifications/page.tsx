import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CertificationsView } from "@/components/certification/CertificationsView";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { certificationHref, parseCertificationQuery } from "@/lib/certifications/query";
import { getSupplierCertificationView } from "@/lib/certifications/store";
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

  const query = parseCertificationQuery(await searchParams);
  const base = siteUrl();
  const path = `${supplier.url}/certifications`;
  // Filters, sorts and page sizes are the same list under another URL: one canonical, kept out of the index.
  // Plain pagination keeps its own canonical so every page of a long list can be found.
  const filtered = certificationHref(path, query, { page: 1 }) !== path;
  const title = `Certifications of ${supplier.name}, ${supplier.city} | Finbyn Mart`;
  const description = `See the certifications published by ${supplier.name} in ${supplier.city}, ${supplier.state}: type, issuing authority, issue and expiry dates and status.`;
  return {
    title,
    description,
    ...(base ? { alternates: { canonical: query.page > 1 && !filtered ? `${base}${path}?page=${query.page}` : `${base}${path}` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, type: "website", ...(base ? { url: `${base}${path}` } : {}) },
  };
}

async function SupplierCertificationsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug);
  if (!supplier) notFound();

  // The supplier is the one resolved from this URL; every certification query is scoped to it.
  const query = parseCertificationQuery(await searchParams);
  const [view, reviewHeadline] = await Promise.all([getSupplierCertificationView(supplier.slug, query), getReviewHeadlineSafe(supplier.slug)]);

  return <CertificationsView supplier={supplier} basePath={`${supplier.url}/certifications`} view={view} requestedPage={query.page} reviewCount={reviewHeadline?.count} />;
}

export default withPagePerf("page suppliers/:slug/certifications", SupplierCertificationsPage);
