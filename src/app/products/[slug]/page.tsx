import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ProductDetailSection } from "@/components/product/ProductDetailSection";
import { ProductTabs } from "@/components/product/ProductTabs";
import { RelatedProducts } from "@/components/product/RelatedProducts";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { getPublicProductBySlug, getRelatedItems } from "@/lib/catalog/productDetail";
import { siteUrl } from "@/lib/site";
import { withPagePerf } from "@/lib/perf/instrument";

// The page depends on the slug only (nothing per visitor: no cookies, headers or search parameters), so it is rendered once and
// reused for an hour. Wishlist state is fetched by the browser. A slug that does not exist is still a real 404.
export const revalidate = 3600;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getPublicProductBySlug(slug);
  if (!product) return { title: "Product not found | Finbyn Mart", robots: { index: false } };

  const base = siteUrl();
  const title = `${product.name} — ${product.supplier.name} | Finbyn Mart`;
  const description = `${product.name} from ${product.supplier.name}, ${product.supplier.city}, ${product.supplier.state}. Compare price and minimum order, and request a quote on Finbyn Mart.`;
  const image = product.images[0];
  const imageUrl = image ? (image.remote ? image.src : base ? `${base}${image.src}` : undefined) : undefined;

  return {
    title,
    description,
    ...(base ? { alternates: { canonical: `${base}${product.url}` } } : {}),
    openGraph: { title, description, type: "website", ...(base ? { url: `${base}${product.url}` } : {}), ...(imageUrl ? { images: [{ url: imageUrl }] } : {}) },
  };
}

async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getPublicProductBySlug(slug);
  if (!product) notFound();
  // One canonical URL per product, whatever text precedes the id.
  if (product.slug !== slug) permanentRedirect(product.url);

  const related = getRelatedItems(product, 8).map((item) => item.card);
  const base = siteUrl() ?? "";

  // Structured data carries only facts that are accurate: no price (estimated or sample), no rating, no availability.
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: product.breadcrumb.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: `${base}${item.href ?? product.url}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      sku: product.id,
      category: product.subcategory?.name ?? product.category.name,
      ...(product.images[0] ? { image: product.images[0].remote ? product.images[0].src : `${base}${product.images[0].src}` } : {}),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD built from our own data; "<" is escaped so it can never close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <Container>
        <Breadcrumb items={product.breadcrumb} />
      </Container>
      <ProductDetailSection product={product} />
      <Container>
        <ProductTabs
          name={product.name}
          description={product.description}
          features={product.features}
          specifications={product.specifications}
          technicalDetails={product.technicalDetails}
          applications={product.applications}
          documents={product.documents}
        />
      </Container>
      <RelatedProducts products={related} />
      <TrustBenefits overlap={false} />
    </>
  );
}

export default withPagePerf("page products/:slug", ProductPage);
