import { Container } from "@/components/ui/Container";
import { RequirementForm } from "@/components/homepage/RequirementBanner/RequirementForm";
import styles from "./ProductInquirySection.module.css";

export function ProductInquirySection({ productName }: { productName: string }) {
  return (
    <section id="get-best-quote" className={styles.section} aria-labelledby="inquiry-heading">
      <Container>
        <div className={styles.panel}>
          <div>
            <h2 id="inquiry-heading" className={styles.title}>
              Get Best Quote for {productName}
            </h2>
            <p className={styles.subtitle}>
              Share your requirement and compare offers from verified suppliers.
            </p>
          </div>
          <RequirementForm />
        </div>
      </Container>
    </section>
  );
}
