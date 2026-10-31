import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { HeroSearch } from "@/components/homepage/HeroSearch";
import { HERO_STATS } from "@/lib/constants/trust";
import styles from "./HeroSection.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <Container>
        <div className={styles.grid}>
          <div className={styles.textCol}>
            <p className={styles.eyebrow}>India&apos;s Trusted B2B Marketplace</p>
            <h1 id="hero-heading" className={styles.heading}>
              Find Reliable <span className={styles.highlight}>Suppliers</span>
              <br />
              for <span className={styles.highlight}>Your Business</span>
            </h1>
            <p className={styles.description}>
              Connect with verified manufacturers, suppliers and exporters across India. Get the best prices, compare quotes and grow your business.
            </p>
            <HeroSearch />
          </div>

          <div className={styles.visualCol}>
            <div className={styles.visual}>
              <Image
                src="/images/hero/hero-professionals.png"
                alt="Finbyn Mart Verified Business Partners & Suppliers"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 500px"
                className={styles.heroImg}
              />
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
