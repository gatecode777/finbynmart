import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import { LEGAL_DRAFT_NOTICE, type InfoPage } from "@/lib/constants/infoPages";
import type { Block } from "@/lib/constants/termsContent";
import { getSupportChannels } from "@/lib/support/channels";
// shortcut: reuses the Privacy Policy article styles (as Terms does) instead of a shared legal stylesheet; extract one if these styles change
import styles from "@/app/privacy-policy/privacy-policy.module.css";

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "p") return <p key={i}>{b.text}</p>;
        if (b.type === "h3") return <h3 key={i} className={styles.h3}>{b.text}</h3>;
        if (b.type === "ul") return <ul key={i} className={styles.list}>{b.items.map((t) => <li key={t}>{t}</li>)}</ul>;
        if (b.type === "link") return <p key={i}>{b.before}<Link prefetch={false} href={b.href}>{b.label}</Link>{b.after}</p>;
        return (
          <div key={i} className={styles.callout}>
            <p className={styles.calloutTitle}>{b.title}</p>
            {b.paragraphs.map((t) => <p key={t}>{t}</p>)}
          </div>
        );
      })}
    </>
  );
}

/** A static footer information page: one H1, readable sections, existing CTAs. It reads no records and writes nothing. */
export function InfoPageView({ page }: { page: InfoPage }) {
  const toc = <ol className={styles.tocList}>{page.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>;
  const email = getSupportChannels().find((c) => c.key === "email" && c.available);
  return (
    <>
      <section className={styles.hero} aria-labelledby="info-heading">
        <Container>
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: page.title }]} />
          <h1 id="info-heading" className={styles.title}>{page.title}</h1>
          <p className={styles.lead}>{page.lead}</p>
          {page.kind === "legal-draft" && <p className={styles.draft} role="note"><CircleAlert size={18} aria-hidden /> <span>{LEGAL_DRAFT_NOTICE}</span></p>}
        </Container>
      </section>
      <Container>
        <div className={styles.layout}>
          <nav className={styles.tocDesktop} aria-label={`${page.title} contents`}>
            <p className={styles.tocTitle}>On this page</p>
            {toc}
          </nav>
          <div className={styles.main}>
            <details className={styles.tocMobile}>
              <summary>On this page</summary>
              <nav aria-label="On this page">{toc}</nav>
            </details>
            <article className={styles.article}>
              {page.sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className={styles.section}>
                  <h2 id={`${s.id}-h`} className={styles.h2}>{s.title}</h2>
                  <Blocks blocks={s.blocks} />
                </section>
              ))}
              <section aria-labelledby="info-cta-h" className={styles.contact}>
                <div>
                  <h2 id="info-cta-h" className={styles.contactTitle}>{page.ctaTitle}</h2>
                  <p>{page.ctaText}{email?.detail ? <> You can also write to <a href={email.href ?? undefined}>{email.detail}</a>.</> : null}</p>
                </div>
                {page.ctas.map((cta) => <Link prefetch={false} key={cta.href} href={cta.href} className={styles.contactLink}>{cta.label}</Link>)}
              </section>
            </article>
          </div>
        </div>
      </Container>
    </>
  );
}
