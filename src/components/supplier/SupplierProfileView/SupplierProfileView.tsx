import Link from "next/link";
import { ArrowRight, Boxes, CalendarDays, Check, Factory, MapPin, ShieldCheck, Award } from "lucide-react";
import { ProductCard } from "@/components/category/ProductCard";
import { SupplierInquiryForm } from "@/components/supplier/SupplierInquiryForm";
import { SupplierProfileTabs } from "@/components/supplier/SupplierProfileTabs";
import { Container } from "@/components/ui/Container";
import { ScrollSlider } from "@/components/ui/ScrollSlider";
import { formatCount } from "@/lib/utils/format";
import type { SupplierDetail } from "@/lib/catalog/supplierDetail";
import styles from "./SupplierProfileView.module.css";

/**
 * Everything under the profile header: statistics, tabs, About, company details, certifications, requirement card,
 * the supplier's products, reviews and the contact form. Each block shows only what the supplier record holds;
 * an empty block says so plainly (there are no certifications or reviews in the data yet).
 */
export function SupplierProfileView({ supplier, certificationCount, reviewCount }: { supplier: SupplierDetail; /** Public certifications, when known. */ certificationCount?: number; /** Published reviews, when known. */ reviewCount?: number }) {
  const verified = supplier.verificationStatus === "verified";
  const requirement = new URLSearchParams({ supplier: supplier.slug });

  const stats = [
    { icon: Boxes, value: formatCount(supplier.productCount), label: supplier.productCount === 1 ? "Product" : "Products" },
    ...(supplier.memberSince ? [{ icon: CalendarDays, value: supplier.memberSince, label: "Member Since" }] : []),
    ...(supplier.industry ? [{ icon: Factory, value: supplier.industry, label: "Industry" }] : []),
    { icon: MapPin, value: supplier.state, label: supplier.city },
    { icon: ShieldCheck, value: verified ? "Verified" : "Not verified", label: "Verification" },
  ];

  const details: [string, string][] = [
    ["Company Name", supplier.name],
    ...(supplier.supplierType ? ([["Supplier Type", supplier.supplierType]] as [string, string][]) : []),
    ...(supplier.industry ? ([["Industry", supplier.industry]] as [string, string][]) : []),
    ["Location", `${supplier.city}, ${supplier.state}`],
    ...(supplier.memberSince ? ([["Member Since", supplier.memberSince]] as [string, string][]) : []),
    ["Verification", verified ? "Verified" : "Not verified"],
    ["Products Listed", formatCount(supplier.productCount)],
  ];

  const summary = `${supplier.name} is ${supplier.industry ? `a ${supplier.industry} supplier` : "a supplier"} based in ${supplier.city}, ${supplier.state}, with ${formatCount(supplier.productCount)} ${supplier.productCount === 1 ? "product" : "products"} listed on Finbyn Mart.`;

  return (
    <>
      <Container>
        <ul className={styles.stats} aria-label="Supplier at a glance">
          {stats.map(({ icon: Icon, value, label }) => (
            <li key={label} className={styles.stat}>
              <span className={styles.statIcon} aria-hidden>
                <Icon size={24} strokeWidth={1.75} />
              </span>
              <span>
                <strong className={styles.statValue}>{value}</strong>
                <span className={styles.statLabel}>{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </Container>

      <SupplierProfileTabs url={supplier.url} productCount={supplier.productCount} certificationCount={certificationCount} reviewCount={reviewCount} active="about" />

      <Container>
        <div className={styles.layout}>
          <div className={styles.main}>
            <section id="about" className={styles.card} aria-labelledby="about-heading">
              <h2 id="about-heading" className={styles.heading}>
                About {supplier.name}
              </h2>
              <p>{supplier.description ?? summary}</p>
              {!supplier.description && <p className={styles.note}>{supplier.name} has not added a company description yet.</p>}
              {supplier.categories.length > 0 && (
                <>
                  <h3 className={styles.subheading}>{supplier.source === "catalog" ? "Main product categories" : "Products offered"}</h3>
                  <ul className={styles.checks}>
                    {supplier.categories.map((category) => (
                      <li key={category}>
                        <Check size={16} aria-hidden />
                        {category}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section id="products" className={styles.block} aria-labelledby="products-heading">
              <div className={styles.blockHead}>
                <h2 id="products-heading" className={styles.heading}>
                  Products from {supplier.name}
                </h2>
                {supplier.productCount > 0 && (
                  <Link href={supplier.productsUrl} className={styles.viewAll}>
                    View All Products ({formatCount(supplier.productCount)})
                    <ArrowRight size={16} aria-hidden />
                  </Link>
                )}
              </div>
              {supplier.products.length > 0 ? (
                <ScrollSlider label="products">
                  {supplier.products.map((product) => (
                    <ProductCard key={product.id} product={product} view="grid" />
                  ))}
                </ScrollSlider>
              ) : (
                <p className={styles.empty}>{supplier.name} has not listed any products yet.</p>
              )}
            </section>

            <section id="reviews" className={styles.block} aria-labelledby="reviews-heading">
              <h2 id="reviews-heading" className={styles.heading}>
                Customer Reviews
              </h2>
              {reviewCount === 0 ? (
                <p className={styles.empty}>
                  No reviews have been published for this supplier yet. <Link href={`${supplier.url}/reviews`}>Write the first review</Link>
                </p>
              ) : (
                <p>
                  {reviewCount === undefined ? "See what buyers say about this supplier." : `${formatCount(reviewCount)} ${reviewCount === 1 ? "review is" : "reviews are"} published for this supplier.`}{" "}
                  <Link href={`${supplier.url}/reviews`}>View all reviews</Link>
                </p>
              )}
            </section>

            <SupplierInquiryForm supplierId={supplier.id} supplierName={supplier.name} products={supplier.products} />
            <p>
              Need to add a delivery location, or to ask without an account? <Link href={`/inquiry/${supplier.slug}`}>Open the full inquiry page</Link>.
            </p>
          </div>

          <aside className={styles.side} aria-label="Company information">
            <section className={styles.card} aria-labelledby="details-heading">
              <h2 id="details-heading" className={styles.heading}>
                Company Details
              </h2>
              <table className={styles.table}>
                <tbody>
                  {details.map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section id="certifications" className={styles.card} aria-labelledby="certs-heading">
              <h2 id="certs-heading" className={styles.heading}>
                <Award size={20} aria-hidden />
                Certifications
              </h2>
              {certificationCount === 0 ? (
                <p className={styles.empty}>No certifications have been published for this supplier yet.</p>
              ) : (
                <p>
                  {certificationCount === undefined ? "See the certifications published by this supplier." : `${formatCount(certificationCount)} ${certificationCount === 1 ? "certification is" : "certifications are"} published for this supplier.`}{" "}
                  <Link href={`${supplier.url}/certifications`}>View all certifications</Link>
                </p>
              )}
            </section>

            <section className={styles.requirement} aria-labelledby="requirement-heading">
              <h2 id="requirement-heading" className={styles.requirementTitle}>
                Need a Custom Requirement?
              </h2>
              <p>Share your specific requirements and get a quotation from {supplier.name}.</p>
              <Link href={`/post-requirement?${requirement}`} className={styles.requirementLink}>
                Post Your Requirement
                <ArrowRight size={16} aria-hidden />
              </Link>
            </section>
          </aside>
        </div>
      </Container>
    </>
  );
}
