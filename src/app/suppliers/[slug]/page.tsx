import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { SupplierProfileHeader } from "@/components/supplier/SupplierProfileHeader";
import { SupplierProfileView } from "@/components/supplier/SupplierProfileView";
import { getPublicSupplierBySlug } from "@/lib/catalog/supplierDetail";
import { countPublicCertificationsSafe } from "@/lib/certifications/store";
import { getReviewHeadlineSafe } from "@/lib/reviews/store";
import { siteUrl } from "@/lib/site";
import { withPagePerf } from "@/lib/perf/instrument";

export const dynamic = "force-dynamic";

interface SupplierPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: SupplierPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug);
  if (!supplier) return { title: "Supplier not found | Finbyn Mart", robots: { index: false } };

  const base = siteUrl();
  const kind = supplier.supplierType ?? supplier.industry ?? "Supplier";
  const title = `${supplier.name} — ${kind}, ${supplier.city} | Finbyn Mart`;
  const description = `${supplier.name} in ${supplier.city}, ${supplier.state}: ${supplier.productCount} ${supplier.productCount === 1 ? "product" : "products"} on Finbyn Mart. Send an inquiry or request a quote.`;
  const image = supplier.images[0];
  const imageUrl = image ? (image.remote ? image.src : base ? `${base}${image.src}` : undefined) : undefined;

  return {
    title,
    description,
    ...(base ? { alternates: { canonical: `${base}${supplier.url}` } } : {}),
    openGraph: { title, description, type: "website", ...(base ? { url: `${base}${supplier.url}` } : {}), ...(imageUrl ? { images: [{ url: imageUrl }] } : {}) },
  };
}

async function SupplierPage({ params }: SupplierPageProps) {
  const { slug } = await params;
  const supplier = getPublicSupplierBySlug(slug);
  if (!supplier) notFound();

  const [certificationCount, reviewHeadline] = await Promise.all([countPublicCertificationsSafe(supplier.slug), getReviewHeadlineSafe(supplier.slug)]);
  const base = siteUrl() ?? "";
  // Structured data carries only supported facts: no rating, review, certification or verification claim.
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: "Suppliers", item: `${base}/suppliers` },
        { "@type": "ListItem", position: 3, name: supplier.name, item: `${base}${supplier.url}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: supplier.name,
      url: `${base}${supplier.url}`,
      address: { "@type": "PostalAddress", addressLocality: supplier.city, addressRegion: supplier.state, addressCountry: "IN" },
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD built from our own data; "<" is escaped so it can never close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <SupplierProfileHeader supplier={supplier} />
      <SupplierProfileView supplier={supplier} certificationCount={certificationCount} reviewCount={reviewHeadline?.count} />
      <TrustBenefits overlap={false} />
    </>
  );
}

export default withPagePerf("page suppliers/:slug", SupplierPage);
