import Image from "next/image";
import { InquiryAside } from "@/components/inquiry/InquiryAside";
import { InquirySupplierCard } from "@/components/inquiry/InquirySupplierCard";
import { InquiryWorkspace, type ProductOption, type Viewer } from "@/components/inquiry/InquiryWorkspace";
import { TrustBenefits } from "@/components/homepage/TrustBenefits";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import type { SupplierDetail } from "@/lib/catalog/supplierDetail";
import { siteUrl } from "@/lib/site";
import styles from "./InquiryPageView.module.css";

interface InquiryPageViewProps {
  supplier: SupplierDetail;
  products: ProductOption[];
  moreProducts: boolean;
  initialProductId?: string;
  productNotice?: string;
  viewer: Viewer;
  rating?: { average: number; count: number };
}

/**
 * Page 13: breadcrumb and heading with the supplier's own product photos (never a stock picture), then the supplier
 * card, the inquiry form and the benefits, then the shared trust strip. The page is a personal workflow, so it is kept
 * out of search indexes (see the route's metadata) and carries only a breadcrumb in structured data.
 */
export function InquiryPageView({ supplier, products, moreProducts, initialProductId, productNotice, viewer, rating }: InquiryPageViewProps) {
  const base = siteUrl() ?? "";
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", path: "/" },
      { name: "Suppliers", path: "/suppliers" },
      { name: supplier.name, path: supplier.url },
      { name: "Contact Supplier", path: `/inquiry/${supplier.slug}` },
    ].map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${base}${item.path}` })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }} />

      <section className={styles.hero} aria-labelledby="inquiry-heading">
        <Container>
          <div className={styles.crumbs}>
            <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Suppliers", href: "/suppliers" }, { label: supplier.name, href: supplier.url }, { label: "Contact Supplier" }]} />
          </div>
          <div className={styles.grid}>
            <div className={styles.text}>
              <h1 id="inquiry-heading" className={styles.title}>
                Contact Supplier / <span className={styles.accent}>Send Inquiry</span>
              </h1>
              <p className={styles.lead}>Share your requirement with {supplier.name} and get the details of the product, its price and its availability in writing.</p>
            </div>
            {supplier.images.length > 0 && (
              <ul className={styles.photos} aria-label={`Products from ${supplier.name}`}>
                {supplier.images.map((image) => (
                  <li key={image.src} className={styles.photo}>
                    <Image src={image.src} alt={image.alt} fill sizes="(max-width: 900px) 30vw, 180px" unoptimized={image.remote} className={styles.photoImage} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Container>
      </section>

      <Container>
        <InquiryWorkspace
          supplier={{ slug: supplier.slug, name: supplier.name, url: supplier.url }}
          products={products}
          moreProducts={moreProducts}
          initialProductId={initialProductId}
          productNotice={productNotice}
          viewer={viewer}
          supplierCard={<InquirySupplierCard supplier={supplier} rating={rating} />}
          aside={<InquiryAside requirementHref={`/post-requirement?supplier=${encodeURIComponent(supplier.slug)}`} />}
        />
      </Container>

      <div className={styles.trust}>
        <TrustBenefits overlap={false} />
      </div>
    </>
  );
}
