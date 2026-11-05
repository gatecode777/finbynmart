import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import styles from "./BulkRequirementCta.module.css";

interface BulkRequirementCtaProps {
  heading?: string;
  description?: string;
  href?: string;
  /** Button text; defaults to "Post Your Requirement". */
  label?: string;
  icon?: ReactNode;
}

/** Full-width mint banner that sends the buyer into the existing requirement flow (prefilled via `href`). */
export function BulkRequirementCta({
  heading = "Looking for Bulk Supply or Custom Requirement?",
  description = "Get quotes from verified suppliers for your specific needs.",
  href = "/post-requirement",
  label = "Post Your Requirement",
  icon = <Users size={40} strokeWidth={1.5} />,
}: BulkRequirementCtaProps) {
  return (
    <Container>
      <section className={styles.banner} aria-labelledby="bulk-requirement-heading">
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
        <div className={styles.text}>
          <h2 id="bulk-requirement-heading" className={styles.title}>
            {heading}
          </h2>
          <p className={styles.description}>{description}</p>
        </div>
        <Link href={href} className={styles.cta}>
          {label}
          <ArrowRight size={18} strokeWidth={2.25} aria-hidden />
        </Link>
      </section>
    </Container>
  );
}
