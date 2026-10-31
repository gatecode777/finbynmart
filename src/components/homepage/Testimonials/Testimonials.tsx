import { Star } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TESTIMONIALS } from "@/lib/constants/testimonials";
import styles from "./Testimonials.module.css";

export function Testimonials() {
  return (
    <section className={styles.section} aria-labelledby="testimonials-heading">
      <Container>
        <SectionHeading
          eyebrow="Reviews"
          title={<span id="testimonials-heading">What Businesses Say</span>}
        />
        {/* Sample quotes — swap for genuine, customer-approved testimonials before launch. See docs/MISSING_ASSETS.md */}
        <p className={styles.notice}>Sample quotes shown for layout only.</p>
        <div className={styles.grid}>
          {TESTIMONIALS.map((testimonial) => (
            <article key={testimonial.id} className={styles.card}>
              {testimonial.rating && (
                <div className={styles.stars} aria-label={`${testimonial.rating} out of 5 stars`}>
                  {Array.from({ length: testimonial.rating }).map((_, index) => (
                    <Star key={index} size={14} fill="currentColor" strokeWidth={0} aria-hidden />
                  ))}
                </div>
              )}
              <p className={styles.quote}>&ldquo;{testimonial.quote}&rdquo;</p>
              <div className={styles.author}>
                <span className={styles.name}>{testimonial.name}</span>
                <span className={styles.business}>{testimonial.businessName}</span>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
