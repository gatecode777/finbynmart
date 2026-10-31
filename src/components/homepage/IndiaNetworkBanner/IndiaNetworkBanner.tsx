import Image from "next/image";
import { ShieldCheck, TrendingUp, Users, Boxes, Building2, Award } from "lucide-react";
import { Container } from "@/components/ui/Container";
import styles from "./IndiaNetworkBanner.module.css";

export function IndiaNetworkBanner() {
  return (
    <section className={styles.section} aria-label="India Supplier Network">
      <Container>
        <div className={styles.cardsGrid}>
          {/* Card 1: India Supplier Network */}
          <div className={`${styles.valueCard} ${styles.cardPeach}`}>
            <div className={styles.mapIconWrap}>
              <Image
                src="/images/banners/india-map.png"
                alt="All India Network"
                width={50}
                height={50}
                className={styles.indiaMapImg}
              />
            </div>
            <div className={styles.cardContent}>
              <h3 className={styles.cardTitle}>All India Supplier Network</h3>
              <p className={styles.cardDesc}>
                Connect with verified businesses across every state and city in India.
              </p>
            </div>
          </div>

          {/* Card 2: Safe & Secure Inquiries */}
          <div className={`${styles.valueCard} ${styles.cardMint}`}>
            <div className={styles.shieldIconWrap}>
              <ShieldCheck size={28} className={styles.shieldIcon} strokeWidth={2.2} />
            </div>
            <div className={styles.cardContent}>
              <h3 className={styles.cardTitle}>Safe &amp; Secure Inquiries</h3>
              <p className={styles.cardDesc}>
                Your business inquiries are protected and shared only with genuine suppliers.
              </p>
            </div>
          </div>

          {/* Card 3: Grow Your Business */}
          <div className={`${styles.valueCard} ${styles.cardLavender}`}>
            <div className={styles.trendIconWrap}>
              <TrendingUp size={28} className={styles.trendIcon} strokeWidth={2.2} />
            </div>
            <div className={styles.cardContent}>
              <h3 className={styles.cardTitle}>Grow Your Business</h3>
              <p className={styles.cardDesc}>
                Find new suppliers, better prices and expand your business network.
              </p>
            </div>
          </div>
        </div>

        {/* Dark Navy Stats Bar */}
        <div className={styles.statsBar}>
          <div className={styles.statItem}>
            <Users size={22} className={styles.statIcon} strokeWidth={1.75} />
            <div className={styles.statText}>
              <span className={styles.statNumber}>10,00,000+</span>
              <span className={styles.statLabel}>Verified Suppliers</span>
            </div>
          </div>

          <div className={styles.statItem}>
            <Boxes size={22} className={styles.statIcon} strokeWidth={1.75} />
            <div className={styles.statText}>
              <span className={styles.statNumber}>50,00,000+</span>
              <span className={styles.statLabel}>Products &amp; Services</span>
            </div>
          </div>

          <div className={styles.statItem}>
            <Building2 size={22} className={styles.statIcon} strokeWidth={1.75} />
            <div className={styles.statText}>
              <span className={styles.statNumber}>All India</span>
              <span className={styles.statLabel}>Business Network</span>
            </div>
          </div>

          <div className={styles.statItem}>
            <Award size={22} className={styles.statIcon} strokeWidth={1.75} />
            <div className={styles.statText}>
              <span className={styles.statNumber}>Trusted Platform</span>
              <span className={styles.statLabel}>for Business Growth</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
