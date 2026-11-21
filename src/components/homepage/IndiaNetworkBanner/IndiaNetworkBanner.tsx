import Image from "next/image";
import { ShieldCheck, TrendingUp } from "lucide-react";
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
                Find suppliers and send inquiries to businesses across India.
              </p>
            </div>
          </div>

          {/* Card 2: Safe & Secure Inquiries */}
          <div className={`${styles.valueCard} ${styles.cardMint}`}>
            <div className={styles.shieldIconWrap}>
              <ShieldCheck size={28} className={styles.shieldIcon} strokeWidth={2.2} />
            </div>
            <div className={styles.cardContent}>
              <h3 className={styles.cardTitle}>Inquiries in One Place</h3>
              <p className={styles.cardDesc}>
                Send inquiries and requirements through Finbyn Mart to suppliers on the platform.
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
                Find new suppliers and request quotes to expand your business network.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
