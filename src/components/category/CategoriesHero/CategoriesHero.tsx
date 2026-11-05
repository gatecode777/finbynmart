import Image from "next/image";
import { Boxes, Layers3, LayoutGrid } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import { formatCount } from "@/lib/utils/format";
import styles from "./CategoriesHero.module.css";

interface CategoriesHeroProps {
  totals: { mainCategories: number; subcategories: number; products: number };
}

export function CategoriesHero({ totals }: CategoriesHeroProps) {
  const stats = [
    { label: totals.mainCategories === 1 ? "Main Category" : "Main Categories", value: totals.mainCategories, icon: LayoutGrid },
    { label: totals.subcategories === 1 ? "Subcategory" : "Subcategories", value: totals.subcategories, icon: Boxes },
    { label: totals.products === 1 ? "Product" : "Products", value: totals.products, icon: Layers3 },
  ];

  return (
    <section className={styles.hero} aria-labelledby="categories-heading">
      <Container>
        <div className={styles.crumbs}>
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "All Categories" }]} />
        </div>
      </Container>

      <div className={styles.photoWrap}>
        <span className={styles.arc} aria-hidden />
        <div className={styles.photo}>
          <Image
            src="/images/industries/retail-wholesale.jpg"
            alt="A warehouse aisle with stocked shelving"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className={styles.image}
          />
        </div>
      </div>

      <Container>
        <div className={styles.content}>
          <p className={styles.eyebrow}>Explore Our Product Categories</p>
          <h1 id="categories-heading" className={styles.title}>
            All Categories
          </h1>
          <p className={styles.lead}>
            Discover a wide range of product categories and find the right suppliers for your business needs.
          </p>
          <ul className={styles.stats}>
            {stats.map(({ label, value, icon: Icon }) => (
              <li key={label} className={styles.stat}>
                <span className={styles.statIcon}>
                  <Icon size={22} strokeWidth={1.75} aria-hidden />
                </span>
                <span>
                  <span className={styles.statValue}>{formatCount(value)}</span>
                  <span className={styles.statLabel}>{label}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
