import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { formatCount } from "@/lib/utils/format";
import styles from "./SupplierProfileTabs.module.css";

/**
 * Tabs shared by the supplier pages. About Company, Products, Certifications and Reviews are pages of their own;
 * Contact goes to the inquiry form on the profile. The tab for the current page is marked. The Certifications and
 * Reviews tabs show a count only when one is known.
 */
export function SupplierProfileTabs({ url, productCount, certificationCount, reviewCount, active }: { url: string; productCount: number; certificationCount?: number; reviewCount?: number; active: "about" | "products" | "certifications" | "reviews" }) {
  const tabs = [
    { id: "about", label: "About Company", href: url },
    { id: "products", label: `Products (${formatCount(productCount)})`, href: `${url}/products` },
    { id: "certifications", label: certificationCount === undefined ? "Certifications" : `Certifications (${formatCount(certificationCount)})`, href: `${url}/certifications` },
    { id: "reviews", label: reviewCount === undefined ? "Reviews" : `Reviews (${formatCount(reviewCount)})`, href: `${url}/reviews` },
    { id: "contact", label: "Contact & Inquiry", href: `${url}#contact` },
  ];

  return (
    <Container>
      <nav className={styles.tabs} aria-label="Supplier profile">
        <ul className={styles.list}>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <Link href={tab.href} className={tab.id === active ? styles.on : styles.tab} aria-current={tab.id === active ? "page" : undefined}>
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Container>
  );
}
