import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageIntro } from "@/components/ui/PageIntro";
import { HelpFaq } from "@/components/help/HelpFaq/HelpFaq";
import { getFaqCategories, getPublishedFaqs } from "@/lib/support/faq";
import { getSupportChannels } from "@/lib/support/channels";
import { siteUrl } from "@/lib/site";
import styles from "./help.module.css";

// rendered per request (still no database): the optional e-mail and phone channels come from the runtime environment, not from the build
export const dynamic = "force-dynamic";

const TITLE = "Help Center & FAQs | Finbyn Mart";
const DESCRIPTION = "Answers about creating an account, sending inquiries and requirements, quotations and conversations, supplier accounts and products, and how to contact Finbyn Mart.";

export function generateMetadata(): Metadata {
  const base = siteUrl();
  return { title: TITLE, description: DESCRIPTION, ...(base ? { alternates: { canonical: `${base}/help` } } : {}) };
}

/**
 * Help Center & FAQs (Page 15): static, public, server-rendered content from the ONE FAQ source (src/lib/support/faq.ts: published entries only) with a small client search and topic filter. No
 * session, database or write is involved. Contact Us always shows; an e-mail address or phone number only when the site really has one configured (SUPPORT_EMAIL / SUPPORT_PHONE, through the
 * existing channels service); live chat is never offered; the two portal support pages are labelled and still require sign-in.
 */
export default function HelpPage() {
  const channels = getSupportChannels().filter((c) => (c.key === "contact" || c.key === "email" || c.key === "phone") && c.available && c.href);
  const faqs = getPublishedFaqs().map(({ id, category, question, answer, links }) => ({ id, category, question, answer, links }));
  return (
    <>
      <Container>
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Help Center & FAQs" }]} />
        <PageIntro title="Help Center & FAQs" subtitle="Find answers about accounts, inquiries, requirements, quotations and supplier products. Search or pick a topic." />
        <div className={styles.faq}>
          <HelpFaq faqs={faqs} topics={getFaqCategories()} />
        </div>
      </Container>
      <section className={styles.contact} aria-labelledby="help-contact-heading">
        <Container>
          <h2 id="help-contact-heading" className={styles.contactHeading}>Still need help?</h2>
          <ul className={styles.contactList}>
            {channels.map((c) => (
              <li key={c.key} className={styles.contactItem}>
                {c.key === "contact" ? <Link href={c.href!} className={styles.contactLink}>{c.label}</Link> : <a href={c.href!} className={styles.contactLink}>{c.label}</a>}
                <span className={styles.contactNote}>{c.detail ?? c.note}</span>
              </li>
            ))}
            <li className={styles.contactItem}>
              <Link href="/buyer/support" className={styles.contactLink}>Buyer support tickets</Link>
              <span className={styles.contactNote}>For buyer accounts. You will be asked to sign in first.</span>
            </li>
            <li className={styles.contactItem}>
              <Link href="/supplier/support" className={styles.contactLink}>Supplier support tickets</Link>
              <span className={styles.contactNote}>For supplier accounts. You will be asked to sign in first.</span>
            </li>
          </ul>
          <p className={styles.fine}>Live chat is not available, and no response time is promised.</p>
        </Container>
      </section>
    </>
  );
}
