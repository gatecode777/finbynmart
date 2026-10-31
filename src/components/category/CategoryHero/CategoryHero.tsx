import { Container } from "@/components/ui/Container";
import { MediaTile } from "@/components/ui/MediaTile";
import type { CategoryPageData } from "@/types";
import styles from "./CategoryHero.module.css";

export function CategoryHero({ category }: { category: CategoryPageData }) {
  return (
    <section className={styles.section} aria-labelledby="category-hero-heading">
      <Container>
        <div className={styles.grid}>
          <div>
            <h1 id="category-hero-heading" className={styles.title}>
              {category.name}
            </h1>
            <p className={styles.description}>{category.description}</p>

            <div className={styles.stats}>
              {category.stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className={styles.statCard}>
                    <span className={styles.statIcon}>
                      <Icon size={16} strokeWidth={2} aria-hidden />
                    </span>
                    <span>
                      <span className={styles.statValue}>{stat.value}</span>
                      <span className={styles.statLabel}>{stat.label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.visual}>
            <MediaTile
              tile={category.heroVisual}
              alt={`${category.name} product photography`}
              iconSize={64}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
