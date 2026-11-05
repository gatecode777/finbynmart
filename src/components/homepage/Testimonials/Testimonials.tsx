import Image from "next/image";
import { Quote, Star, UserRound } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TESTIMONIALS } from "@/lib/constants/testimonials";
import styles from "./Testimonials.module.css";

export function Testimonials() {
  return (
    <section className={styles.section} aria-labelledby="testimonials-heading">
      <Container>
        {/* Sample quotes — swap for genuine, customer-approved testimonials (with a photo only if the customer agrees) before launch. See docs/MISSING_ASSETS.md */}
        <SectionHeading
          eyebrow="Reviews"
          title={<span id="testimonials-heading">What Businesses Say</span>}
          subtitle="Sample quotes shown for layout only."
        />
        <div className={styles.grid}>
          {TESTIMONIALS.map((testimonial) => (
            <article key={testimonial.id} className={styles.card}>
              <span className={styles.quoteMark} aria-hidden>
                <Quote size={18} strokeWidth={2} fill="currentColor" />
              </span>
              {testimonial.rating && (
                <div className={styles.stars} role="img" aria-label={`${testimonial.rating} out of 5 stars`}>
                  {Array.from({ length: testimonial.rating }).map((_, index) => (
                    <Star key={index} size={16} fill="currentColor" strokeWidth={0} aria-hidden />
                  ))}
                </div>
              )}
              <p className={styles.quote}>{testimonial.quote}</p>
              <footer className={styles.author}>
                <span className={styles.avatar}>
                  {testimonial.avatarSrc ? (
                    <Image src={testimonial.avatarSrc} alt="" fill sizes="48px" className={styles.avatarImg} />
                  ) : (
                    <UserRound size={22} strokeWidth={1.75} aria-hidden />
                  )}
                </span>
                <span className={styles.who}>
                  <span className={styles.name}>{testimonial.name}</span>
                  <span className={styles.business}>{testimonial.businessName}</span>
                </span>
              </footer>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
