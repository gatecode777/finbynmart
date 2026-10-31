import { Container } from "@/components/ui/Container";
import { TRUST_BENEFITS } from "@/lib/constants/trust";
import styles from "./TrustBenefits.module.css";

export function TrustBenefits() {
  return (
    <section className={styles.section} aria-label="Why choose Finbyn Kart">
      <Container>
        <div className={styles.card}>
          {TRUST_BENEFITS.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.label} className={styles.item}>
                <span className={styles.icon}>
                  <Icon size={20} strokeWidth={2} aria-hidden />
                </span>
                <span>
                  <span className={styles.title}>{benefit.label}</span>
                  <br />
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
