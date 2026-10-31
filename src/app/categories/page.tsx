import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { PageBody } from "@/components/ui/PageBody";
import { ResultGrid } from "@/components/ui/ResultGrid";
import { TileLinkCard } from "@/components/ui/TileLinkCard";
import { TOP_CATEGORIES } from "@/lib/constants/categories";
import { resolveCategorySlug } from "@/lib/constants/categoryAliases";
import { getProductFacets } from "@/lib/catalog/queries";
import { formatCount } from "@/lib/utils/format";
import styles from "./categories.module.css";

export const metadata: Metadata = {
  title: "All Categories | Finbyn Mart",
  description: "Browse every product category on Finbyn Mart.",
};

export default function CategoriesPage() {
  const { departments } = getProductFacets();

  return (
    <Container>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "All Categories" }]} />
      <PageBody>
        <PageIntro title="All Categories" subtitle="Browse suppliers and products by category." />

        <ResultGrid variant="category">
          {TOP_CATEGORIES.map((category) => (
            <TileLinkCard
              key={category.id}
              href={`/category/${resolveCategorySlug(category.id)}`}
              name={category.name}
              tile={category}
            />
          ))}
        </ResultGrid>

        <section className={styles.catalog} aria-labelledby="apparel-catalog">
          <h2 id="apparel-catalog" className={styles.heading}>
            Browse the apparel catalog
          </h2>
          <p className={styles.note}>Every product in the catalog is apparel. Jump straight to a department.</p>
          <ul className={styles.departments}>
            {departments.map((department) => (
              <li key={department.name}>
                <Link href={`/products?department=${encodeURIComponent(department.name)}`} className={styles.department}>
                  <span className={styles.departmentName}>{department.name}</span>
                  <span className={styles.departmentCount}>{formatCount(department.count)} products</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </Container>
  );
}
