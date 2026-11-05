import type { LucideIcon } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CategoryImage } from "@/components/category/CategoryCard";
import type { BreadcrumbItem } from "@/types";
import { Container } from "@/components/ui/Container";
import { FALLBACK_ICON, SIDEBAR_ICONS } from "@/components/category/CategoryExplorer/sidebarIcons";
import { formatCount } from "@/lib/utils/format";
import styles from "./CategoryDetailHero.module.css";

export interface HeroStat {
  label: string;
  value: number;
  icon: LucideIcon;
}

interface CategoryDetailHeroProps {
  name: string;
  description: string;
  iconKey: string;
  imageSrc?: string;
  /** True for hot-linked photos, which next/image must not optimise. */
  imageRemote?: boolean;
  stats: HeroStat[];
  breadcrumbs: BreadcrumbItem[];
}

/** Hero of a category page. Everything shown comes from the category record and its eligible data. */
export function CategoryDetailHero({ name, description, iconKey, imageSrc, imageRemote, stats, breadcrumbs }: CategoryDetailHeroProps) {
  const Icon = SIDEBAR_ICONS[iconKey] ?? FALLBACK_ICON;

  return (
    <section className={styles.hero} aria-labelledby="category-title">
      <Container>
        <div className={styles.crumbs}>
          <Breadcrumb items={breadcrumbs} />
        </div>
      </Container>

      <div className={styles.photoWrap}>
        <span className={styles.arc} aria-hidden />
        <div className={styles.photo}>
          <CategoryImage
            src={imageSrc}
            alt={`${name} products`}
            remote={imageRemote}
            priority
            sizes="(max-width: 900px) 100vw, 46vw"
          />
        </div>
      </div>

      <Container>
        <div className={styles.content}>
          <div className={styles.titleRow}>
            <span className={styles.iconBox} aria-hidden>
              <Icon size={40} strokeWidth={1.5} />
            </span>
            <h1 id="category-title" className={styles.title}>
              {name}
            </h1>
          </div>
          <p className={styles.lead}>{description}</p>
          <ul className={styles.stats}>
            {stats.map(({ label, value, icon: StatIcon }) => (
              <li key={label} className={styles.stat}>
                <span className={styles.statIcon}>
                  <StatIcon size={22} strokeWidth={1.75} aria-hidden />
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
