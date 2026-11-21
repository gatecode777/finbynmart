import { Container } from "@/components/ui/Container";
import { HOW_IT_WORKS } from "@/lib/constants/process";
import styles from "./HowItWorks.module.css";

/** `showHeading={false}` is for the How It Works page, whose own h1 introduces this band (a hidden h2 keeps the outline logical). */
export function HowItWorks({ showHeading = true }: { showHeading?: boolean } = {}) {
  return (
    <section className={styles.section} aria-labelledby="how-it-works-heading">
      <Container>
        {showHeading ? (
          <div className={styles.heading}>
            <p className={styles.eyebrow}>Simple Steps</p>
            <h2 id="how-it-works-heading" className={styles.title}>
              How Finbyn Mart Works
            </h2>
            <p className={styles.subtitle}>
              A simple way to find suppliers and grow your business.
            </p>
          </div>
        ) : (
          <h2 id="how-it-works-heading" className="visually-hidden">The process at a glance</h2>
        )}

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
