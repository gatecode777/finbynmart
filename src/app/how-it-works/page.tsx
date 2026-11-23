import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { HowItWorks } from "@/components/homepage/HowItWorks";
import { HOW_IT_WORKS_PAGE as C, type Step } from "@/lib/constants/howItWorksContent";
import { siteUrl } from "@/lib/site";
import styles from "./how-it-works.module.css";

const DESCRIPTION = "How buyers find suppliers, share requirements and discuss quotations on Finbyn Mart, how suppliers receive inquiries, and who receives what.";

export function generateMetadata(): Metadata {
  const base = siteUrl();
  return {
    title: "How It Works | Finbyn Mart",
    description: DESCRIPTION,
    ...(base ? { alternates: { canonical: `${base}/how-it-works` } } : {}),
  };
}

function Section({ id, heading, steps, numbered = true, alt = false }: { id: string; heading: string; steps: Step[]; numbered?: boolean; alt?: boolean }) {
  return (
    <section className={`${styles.block} ${alt ? styles.alt : ""}`} aria-labelledby={`${id}-heading`}>
      <Container>
        <h2 id={`${id}-heading`} className={styles.heading}>{heading}</h2>
        <ol className={styles.list}>
          {steps.map((step, index) => (
            <li key={step.title} className={styles.item}>
              {numbered ? <span className={styles.num} aria-hidden>{index + 1}</span> : <span className={styles.dot} aria-hidden />}
              <div>
                <h3 className={styles.itemTitle}>{step.title}</h3>
                <p className={styles.itemBody}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/**
 * How It Works (Page 12): static, server-rendered, public. No session, database or write is involved; every link is a plain navigation (sign-in and registration pages already send a
 * signed-in visitor to their own portal). The copy is src/lib/constants/howItWorksContent.ts.
 */
export default function HowItWorksPage() {
  return (
    <>
      <Container>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "How It Works" }]} />
        <PageIntro title={C.title} subtitle={C.subtitle} />
      </Container>
      <HowItWorks showHeading={false} />
      <Section id="buyers" heading={C.buyers.heading} steps={C.buyers.steps} />
      <Section id="distribution" heading={C.distribution.heading} steps={C.distribution.items} numbered={false} alt />
      <Section id="suppliers" heading={C.suppliers.heading} steps={C.suppliers.steps} />
      <section className={`${styles.block} ${styles.alt}`} aria-labelledby="know-heading">
        <Container>
          <h2 id="know-heading" className={styles.heading}>{C.goodToKnow.heading}</h2>
          <ul className={styles.notes}>
            {C.goodToKnow.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Container>
      </section>
      <section className={styles.ctaBlock} aria-labelledby="cta-heading">
        <Container>
          <h2 id="cta-heading" className={styles.heading}>{C.cta.heading}</h2>
          <div className={styles.ctaRow}>
            <Link prefetch={false} href={C.cta.primary.href} className={styles.primary}>{C.cta.primary.label}</Link>
            {C.cta.explore.map((l) => <Link prefetch={false} key={l.href} href={l.href} className={styles.secondary}>{l.label}</Link>)}
          </div>
          <div className={styles.ctaRow}>
            {C.cta.account.map((l) => <Link prefetch={false} key={l.href} href={l.href} className={styles.link}>{l.label}</Link>)}
            <Link prefetch={false} href={C.cta.help.href} className={styles.link}>{C.cta.help.label}</Link>
          </div>
        </Container>
      </section>
    </>
  );
}
