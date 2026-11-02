import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { MediaTile } from "@/components/ui/MediaTile";
import { TOP_CATEGORIES } from "@/lib/constants/categories";
import styles from "./CategoryShowcase.module.css";

export function CategoryShowcase() {
  return (
    <section className={styles.section} aria-labelledby="categories-heading">
      <Container>
        <SectionHeading
          eyebrow="Explore"
          title={
            <span id="categories-heading">
              Discover <span className={styles.highlight}>Top Categories</span>
            </span>
          }
          actionLabel="View All Categories"
          actionHref="/categories"
        />
        <div className={styles.grid}>
          {TOP_CATEGORIES.map((category) => (
            <Link key={category.id} href={category.href} className={styles.card}>
              <div className={styles.tileWrap}>
                <MediaTile tile={category} alt="" />
              </div>
              <span className={styles.overlay} aria-hidden />
              <span className={styles.label}>
                <span className={styles.name}>{category.name}</span>
                <span className={styles.arrow} aria-hidden>
                  <ArrowRight size={18} strokeWidth={2.25} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
