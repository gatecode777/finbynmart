import { Container } from "@/components/ui/Container";
import { HOW_IT_WORKS } from "@/lib/constants/process";
import styles from "./HowItWorks.module.css";

export function HowItWorks() {
  return (
    <section className={styles.section} aria-labelledby="how-it-works-heading">
      <Container>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Simple &amp; Secure</p>
          <h2 id="how-it-works-heading" className={styles.title}>
            How Finbyn Kart Works
          </h2>
          <p className={styles.subtitle}>
            A simple and secure way to grow your business.
          </p>
        </div>

        <ol className={styles.steps}>
          {HOW_IT_WORKS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.step} className={styles.step}>
                <span className={styles.iconWrap}>
                  <Icon size={26} strokeWidth={1.75} aria-hidden />
                  <span className={styles.number}>{item.step}</span>
                </span>
                <span className={styles.stepTitle}>{item.title}</span>
                <span className={styles.stepDescription}>{item.description}</span>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
