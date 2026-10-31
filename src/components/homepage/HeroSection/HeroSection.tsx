import { BriefcaseBusiness } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { HeroSearch } from "@/components/homepage/HeroSearch";
import { HERO_STATS } from "@/lib/constants/trust";
import styles from "./HeroSection.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <Container>
        <div className={styles.grid}>
          <div>
            <p className={styles.eyebrow}>India&apos;s Leading B2B Marketplace</p>
            <h1 id="hero-heading" className={styles.heading}>
              Find the Right <span className={styles.highlight}>Suppliers</span>
              <br />
              for <span className={styles.highlight}>Your Business</span>
            </h1>
            <p className={styles.description}>
              Connect with verified manufacturers, suppliers, wholesalers and
              exporters across India. Get the best prices, compare quotes and
              grow your business with trusted partners.
            </p>
            <HeroSearch />
          </div>

          <div>
            {/* Placeholder for licensed business photography — see docs/MISSING_ASSETS.md */}
            <div className={styles.visual} role="img" aria-label="Business professionals">
              <BriefcaseBusiness size={72} strokeWidth={1} aria-hidden />
              <span className={styles.visualNote}>Photography pending</span>
            </div>

            <div className={styles.stats}>
              {HERO_STATS.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className={styles.statCard}>
                    <span className={styles.statIcon}>
                      <Icon size={18} strokeWidth={2} aria-hidden />
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
        </div>
      </Container>
    </section>
  );
}
