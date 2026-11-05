import Image from "next/image";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import { formatCount } from "@/lib/utils/format";
import type { BreadcrumbItem } from "@/types";
import styles from "./PageHero.module.css";

export interface HeroStat {
  label: string;
  value: number;
  icon: LucideIcon;
}

export interface PageHeroProps {
  breadcrumbs: BreadcrumbItem[];
  eyebrow: string;
  /** Heading, in the plain colour (may be empty when the whole heading is the accent). */
  title?: string;
  /** Last word(s) of the heading, in gold. */
  accent?: string;
  headingId: string;
  /** Smaller heading for long text such as a search query. */
  compact?: boolean;
  description: string;
  /** Only statistics that come from real data; an empty list hides the row. */
  stats: HeroStat[];
  image: { src: string; alt: string };
}

/**
 * Two-column listing hero: breadcrumb, eyebrow, Anton heading, description, computed statistics and a
 * photo framed by a gold arc (stacked on phones, bleeding to the right edge from 900px).
 */
export function PageHero({ breadcrumbs, eyebrow, title = "", accent, headingId, compact, description, stats, image }: PageHeroProps) {
  return (
    <section className={styles.hero} aria-labelledby={headingId}>
      <Container>
        <div className={styles.crumbs}>
          <Breadcrumb items={breadcrumbs} />
        </div>
      </Container>

      <div className={styles.photoWrap}>
        <span className={styles.arc} aria-hidden />
        <div className={styles.photo}>
          <Image src={image.src} alt={image.alt} fill priority sizes="(max-width: 900px) 100vw, 50vw" className={styles.image} />
        </div>
      </div>

      <Container>
        <div className={styles.content}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 id={headingId} className={clsx(styles.title, compact && styles.compact)}>
            {title && <span className={styles.titlePlain}>{title}</span>}
            {accent && (
              <>
                {title && " "}
                <span className={styles.titleAccent}>{accent}</span>
              </>
            )}
          </h1>
          <p className={styles.lead}>{description}</p>
          {stats.length > 0 && (
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
          )}
        </div>
      </Container>
    </section>
  );
}
