import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import { TERMS_DRAFT_NOTICE, termsSections, termsStatus, type Block } from "@/lib/constants/termsContent";
import { TERMS_PATH } from "@/lib/legal";
import { getSupportChannels } from "@/lib/support/channels";
import { siteUrl } from "@/lib/site";
// shortcut: reuses the Privacy Policy article styles instead of a shared legal component; extract one if a third legal page is added
import styles from "../privacy-policy/privacy-policy.module.css";

const TITLE = "Terms & Conditions | Finbyn Mart";
const DESCRIPTION = "Guidelines for using Finbyn Mart: accounts, buyer and supplier responsibilities, requirements and quotations, orders, acceptable use and contact.";

export function generateMetadata(): Metadata {
  const base = siteUrl();
  const status = termsStatus();
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(base ? { alternates: { canonical: `${base}${TERMS_PATH}` } } : {}),
    // a draft that the business has not approved is not offered to search engines
    ...(status.approved ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", ...(base ? { url: `${base}${TERMS_PATH}` } : {}) },
  };
}

const formatDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "p") return <p key={i}>{b.text}</p>;
        if (b.type === "h3") return <h3 key={i} className={styles.h3}>{b.text}</h3>;
        if (b.type === "ul") return <ul key={i} className={styles.list}>{b.items.map((t) => <li key={t}>{t}</li>)}</ul>;
        if (b.type === "link") return <p key={i}>{b.before}<Link href={b.href}>{b.label}</Link>{b.after}</p>;
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

/**
 * Terms & Conditions (Page 17): a static, server-rendered article. It reads no database and no session and writes nothing, so viewing it is never acceptance and never changes a record. It works
 * without JavaScript (plain contents links and a native disclosure on small screens). The text is a draft until TERMS_EFFECTIVE_DATE is set after business and legal approval.
 */
export default function TermsPage() {
  const status = termsStatus();
  const sections = termsSections(status);
  const email = getSupportChannels().find((c) => c.key === "email" && c.available);
  const toc = (
    <ol className={styles.tocList}>
      {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
      <li><a href="#contact">Contact</a></li>
    </ol>
  );
  return (
    <>
      <section className={styles.hero} aria-labelledby="terms-heading">
        <Container>
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Terms & Conditions" }]} />
          <h1 id="terms-heading" className={styles.title}>Terms &amp; Conditions</h1>
          <p className={styles.lead}>Guidelines for using the Finbyn Mart marketplace.</p>
          {status.approved ? (
            <p className={styles.meta}>Effective {formatDate(status.effectiveDate!)}{status.version ? ` · Version ${status.version}` : ""}</p>
          ) : (
            <p className={styles.draft} role="note"><CircleAlert size={18} aria-hidden /> <span>{TERMS_DRAFT_NOTICE}</span></p>
          )}
        </Container>
      </section>

      <Container>
        <div className={styles.layout}>
          <nav className={styles.tocDesktop} aria-label="Terms & Conditions contents">
            <p className={styles.tocTitle}>On this page</p>
            {toc}
          </nav>

          <div className={styles.main}>
            <details className={styles.tocMobile}>
              <summary>On this page</summary>
              <nav aria-label="On this page">{toc}</nav>
            </details>

            <article className={styles.article}>
              {sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className={styles.section}>
                  <h2 id={`${s.id}-h`} className={styles.h2}>{s.title}</h2>
                  <Blocks blocks={s.blocks} />
                </section>
              ))}

              <section id="contact" aria-labelledby="contact-h" className={styles.contact}>
                <div>
                  <h2 id="contact-h" className={styles.contactTitle}>Questions about these terms?</h2>
                  <p>Send us a message.{email?.detail ? <> You can also write to <a href={email.href ?? undefined}>{email.detail}</a>.</> : null}</p>
                </div>
                <Link href="/contact-us" className={styles.contactLink}>Contact Us</Link>
              </section>
            </article>
          </div>
        </div>
      </Container>
    </>
  );
}
