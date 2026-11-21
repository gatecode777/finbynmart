import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import { DRAFT_NOTICE, policySections, policyStatus, type Block } from "@/lib/constants/privacyPolicy";
import { getSupportChannels } from "@/lib/support/channels";
import { siteUrl } from "@/lib/site";
import styles from "./privacy-policy.module.css";

const TITLE = "Privacy Policy | Finbyn Mart";
const DESCRIPTION = "How Finbyn Mart handles information: accounts, requirements and inquiries, supplier sharing, cookies, retention and privacy requests.";

export function generateMetadata(): Metadata {
  const base = siteUrl();
  const status = policyStatus();
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(base ? { alternates: { canonical: `${base}/privacy-policy` } } : {}),
    // a draft that the business has not approved is not offered to search engines
    ...(status.approved ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", ...(base ? { url: `${base}/privacy-policy` } : {}) },
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
 * Privacy Policy (Page 16): a static, server-rendered article. It reads no database and no session and writes nothing; it works without JavaScript (the contents list is plain links and the
 * mobile list is a native disclosure). The text is a draft until PRIVACY_POLICY_EFFECTIVE_DATE is set after business and legal approval; the page says so while it is unset.
 */
export default function PrivacyPolicyPage() {
  const status = policyStatus();
  const sections = policySections(status);
  const email = getSupportChannels().find((c) => c.key === "email" && c.available);
  const toc = (
    <ol className={styles.tocList}>
      {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
      <li><a href="#contact">Contact</a></li>
    </ol>
  );
  return (
    <>
      <section className={styles.hero} aria-labelledby="privacy-heading">
        <Container>
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]} />
          <h1 id="privacy-heading" className={styles.title}>Privacy Policy</h1>
          <p className={styles.lead}>Understanding how information is handled on Finbyn Mart.</p>
          {status.approved ? (
            <p className={styles.meta}>Effective {formatDate(status.effectiveDate!)}{status.version ? ` · Version ${status.version}` : ""}</p>
          ) : (
            <p className={styles.draft} role="note"><CircleAlert size={18} aria-hidden /> <span>{DRAFT_NOTICE}</span></p>
          )}
        </Container>
      </section>

      <Container>
        <div className={styles.layout}>
          <nav className={styles.tocDesktop} aria-label="Privacy Policy contents">
            <p className={styles.tocTitle}>Contents</p>
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
                  <h2 id="contact-h" className={styles.contactTitle}>Questions about privacy?</h2>
                  <p>Send us a message, including any request about your information.{email?.detail ? <> You can also write to <a href={email.href ?? undefined}>{email.detail}</a>.</> : null}</p>
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
