import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { MediaTile } from "@/components/ui/MediaTile";
import { INDUSTRY_SOLUTIONS } from "@/lib/constants/industries";
import styles from "./IndustrySolutions.module.css";

export function IndustrySolutions() {
  return (
    <section className={styles.section} aria-labelledby="industries-heading">
      <Container>
        <SectionHeading
          eyebrow="Solutions"
          title={<span id="industries-heading">Industry Solutions</span>}
          actionLabel="Explore All Industries"
          actionHref="/industries"
        />
        <div className={styles.grid}>
          {INDUSTRY_SOLUTIONS.map((industry) => (
            <Link key={industry.id} href={industry.href} className={styles.card}>
              <div className={styles.tileWrap}>
                <MediaTile tile={industry} alt="" iconSize={28} />
              </div>
              <span className={styles.overlay} aria-hidden />
              <span className={styles.name}>{industry.name}</span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
