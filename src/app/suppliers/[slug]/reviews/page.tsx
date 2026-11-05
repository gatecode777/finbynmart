import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReviewsView } from "@/components/review/ReviewsView";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { countPublicCertificationsSafe } from "@/lib/certifications/store";
import { parseReviewQuery, reviewHref } from "@/lib/reviews/query";
import { getOwnReviewForSupplier } from "@/lib/reviews/service";
import { getSupplierReviewView } from "@/lib/reviews/store";
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

  const query = parseReviewQuery(await searchParams);
  const base = siteUrl();
  const path = `${supplier.url}/reviews`;
  // Filters, sorts and page sizes are the same list under another URL: one canonical, kept out of the index.
  // Plain pagination keeps its own canonical so every page of a long list can be found.
  const filtered = reviewHref(path, query, { page: 1 }) !== path;
  const title = `Reviews of ${supplier.name}, ${supplier.city} | Finbyn Mart`;
  const description = `Read buyer reviews and ratings of ${supplier.name} in ${supplier.city}, ${supplier.state} on Finbyn Mart. Reviews are moderated before they are published.`;
  return {
    title,
    description,
    ...(base ? { alternates: { canonical: query.page > 1 && !filtered ? `${base}${path}?page=${query.page}` : `${base}${path}` } } : {}),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, type: "website", ...(base ? { url: `${base}${path}` } : {}) },
  };
}

async function SupplierReviewsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug);
  if (!supplier) notFound();

  // The supplier is the one resolved from this URL; every review query is scoped to it.
  const raw = await searchParams;
  const query = parseReviewQuery(raw);
  // A filter form posts its unselected radio groups as empty values ("range="): same page, clean address.
  if (Object.values(raw).some((value) => value === "")) redirect(reviewHref(`${supplier.url}/reviews`, query));
  const user = await getCurrentUser().catch(() => null);
  const [view, certificationCount, existing] = await Promise.all([
    getSupplierReviewView(supplier.slug, query),
    countPublicCertificationsSafe(supplier.slug),
    user?.role === "buyer" ? getOwnReviewForSupplier(user.id, supplier.slug).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <ReviewsView
      supplier={supplier}
      basePath={`${supplier.url}/reviews`}
      view={view}
      requestedPage={query.page}
      certificationCount={certificationCount}
      viewer={!user ? "guest" : user.role === "buyer" ? "buyer" : "supplier"}
      existing={existing}
    />
  );
}

export default withPagePerf("page suppliers/:slug/reviews", SupplierReviewsPage);
