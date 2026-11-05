import Link from "next/link";
import { ArrowRight, Boxes, Headset, Lock, MessagesSquare, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductPurchase } from "@/components/product/ProductPurchase";
import { ProductSupplierCard } from "@/components/product/ProductSupplierCard";
import type { ProductDetail } from "@/lib/catalog/productDetail";
import styles from "./ProductDetailSection.module.css";

const BENEFITS = [
  { icon: ShieldCheck, title: "Genuine Product", text: "Listed directly by the supplier" },
  { icon: MessagesSquare, title: "Fast Inquiry Response", text: "Connect directly with the supplier" },
  { icon: Lock, title: "Secure & Reliable", text: "Safe business inquiries" },
  { icon: Headset, title: "After Sales Support", text: "Ask the supplier about support" },
];

/**
 * The top of the product page: gallery, product information and purchase actions, and the supplier.
 * Three columns on wide screens, two on tablets (the supplier moves below), one on phones.
 */
export function ProductDetailSection({ product }: { product: ProductDetail }) {
  const bulk = new URLSearchParams({ product: product.name, category: product.category.name });
  if (product.subcategory) bulk.set("subcategory", product.subcategory.name);

  return (
    <section className={styles.section} aria-label="Product">
      <Container>
        <div className={styles.grid}>
          <div className={styles.gallery}>
            <ProductGallery images={product.images} name={product.name} />
          </div>
          <ProductPurchase product={product} />
          <div className={styles.side}>
            <ProductSupplierCard supplier={product.supplier} />
            <aside className={styles.bulk} aria-label="Bulk orders">
              <span className={styles.bulkIcon} aria-hidden>
                <Boxes size={26} strokeWidth={1.75} />
              </span>
              <h2 className={styles.bulkTitle}>Need This in Bulk?</h2>
              <p className={styles.bulkText}>Share your requirements and get a customised quote for bulk orders and long-term supply.</p>
              <Link href={`/post-requirement?${bulk}`} className={styles.bulkLink}>
                Post Your Requirement
                <ArrowRight size={16} aria-hidden />
              </Link>
            </aside>
          </div>
        </div>
        <ul className={styles.benefits} aria-label="Buying with Finbyn Mart">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <li key={title} className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden>
                <Icon size={26} strokeWidth={1.75} />
              </span>
              <span>
                <strong>{title}</strong>
                <span>{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
