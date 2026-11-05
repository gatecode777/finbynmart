import { Container } from "@/components/ui/Container";
import { TRUST_BENEFITS } from "@/lib/constants/trust";
import styles from "./TrustBenefits.module.css";

/** `overlap` pulls the card up over the hero above it (homepage); turn it off on pages where it sits alone. */
export function TrustBenefits({ overlap = true }: { overlap?: boolean }) {
  return (
    <section className={`${styles.section} ${overlap ? styles.overlap : ""}`} aria-label="Why choose Finbyn Mart">
      <Container>
        <div className={styles.card}>
          {TRUST_BENEFITS.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.label} className={styles.item}>
                <span className={styles.icon}>
                  <Icon size={30} strokeWidth={1.75} aria-hidden />
                </span>
                <span>
                  <span className={styles.title}>{benefit.label}</span>
                  <span className={styles.subtitle}>{benefit.value}</span>
                </span>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
