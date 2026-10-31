import { Smartphone, Download, Zap, Bell, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import styles from "./AppPromotion.module.css";

const FEATURES = [
  { label: "Fast & Easy Inquiries", icon: Zap },
  { label: "Stay Updated", icon: Bell },
  { label: "Secure Communication", icon: ShieldCheck },
];

export function AppPromotion() {
  return (
    <section className={styles.section} aria-labelledby="app-promo-heading">
      <Container>
        <div className={styles.panel}>
          <div className={styles.phoneWrap}>
            {/* Real app screenshot pending a published app — see docs/MISSING_ASSETS.md */}
            <div className={styles.phone} role="img" aria-label="Finbyn Kart app preview, coming soon">
              <Smartphone size={40} strokeWidth={1.25} aria-hidden />
            </div>
          </div>

          <div>
            <h2 id="app-promo-heading" className={styles.title}>
              Take Finbyn Kart on the Go
            </h2>
            <p className={styles.description}>
              Connect with suppliers, get quotes and manage your business
              anytime, anywhere.
            </p>
            <div className={styles.storeButtons}>
              <span className={styles.storeButton} aria-disabled="true">
                <Download size={16} strokeWidth={2} aria-hidden />
                Google Play — Coming Soon
              </span>
              <span className={styles.storeButton} aria-disabled="true">
                <Download size={16} strokeWidth={2} aria-hidden />
                App Store — Coming Soon
              </span>
            </div>
          </div>

          <div className={styles.features}>
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.label} className={styles.feature}>
                  <span className={styles.featureIcon}>
                    <Icon size={18} strokeWidth={2} aria-hidden />
                  </span>
                  <span className={styles.featureLabel}>{feature.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
