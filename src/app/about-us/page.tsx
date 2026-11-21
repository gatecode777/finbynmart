import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText, Layers, Mail, MessageSquareText, Search, Store, Users, type LucideIcon } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Container } from "@/components/ui/Container";
import { ABOUT_US, type AboutIcon } from "@/lib/constants/aboutUs";
import { siteUrl } from "@/lib/site";
import { AboutIllustration } from "./AboutIllustration";
import styles from "./about-us.module.css";

const TITLE = "About Us | Finbyn Mart";
const DESCRIPTION = "Finbyn Mart is a B2B marketplace designed to help businesses discover products, connect with relevant suppliers and discuss their sourcing requirements.";

export function generateMetadata(): Metadata {
  const base = siteUrl();
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(base ? { alternates: { canonical: `${base}/about-us` } } : {}),
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", ...(base ? { url: `${base}/about-us` } : {}) },
  };
}

const ICONS: Record<AboutIcon, LucideIcon> = { search: Search, requirements: FileText, conversations: MessageSquareText, compare: Layers };

function Action({ label, href, variant }: { label: string; href: string; variant: "primary" | "secondary" }) {
  const isSuppliers = label.includes("Suppliers");
  const isContact = label.includes("Contact");
  const isPost = variant === "primary";

  return (
    <Link href={href} className={variant === "primary" ? styles.primary : styles.secondary}>
      {isSuppliers && <Users size={18} aria-hidden />}
      {isContact && <Mail size={18} aria-hidden />}
      <span>{label}</span>
      {isPost && <ArrowRight size={18} aria-hidden />}
    </Link>
  );
}

/**
 * About Us (Page 13): a static, server-rendered informational page. No data is read or written and no session is needed, so database availability never affects it. The copy comes from
 * src/lib/constants/aboutUs.ts (draft positioning copy awaiting business approval).
 */
/** Drop-in hero artwork: put a PNG/JPG/WebP at public/images/about/hero-illustration.* and the page uses it; otherwise the drawn SVG is shown. */
const HERO_ART = ["png", "webp", "jpg"].map((ext) => `/images/about/hero-illustration.${ext}`).find((p) => fs.existsSync(path.join(process.cwd(), "public", p)));

export default function AboutUsPage() {
  const c = ABOUT_US;
  return (
    <>
      <section className={styles.hero} aria-labelledby="about-hero-heading">
        <Container>
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: c.title }]} />
          <div className={styles.heroGrid}>
            <div className={styles.heroText}>
              <h1 id="about-hero-heading" className={styles.heroTitle}>{c.heading.split(/(?<=\.)\s+/).map((line) => <span key={line} className={styles.headLine}>{line} </span>)}</h1>
              <p className={styles.lead}>{c.lead}</p>
              <div className={styles.actions}>{c.heroActions.map((a) => <Action key={a.href} {...a} />)}</div>
            </div>
            {/* decorative: the page is complete without it */}
            <div className={styles.art} aria-hidden>
              {HERO_ART ? (
                <span className={styles.photo}><Image src={HERO_ART} alt="" fill sizes="(max-width: 900px) 100vw, 560px" className={styles.photoImg} priority /></span>
              ) : (
                <AboutIllustration className={styles.illustration} />
              )}
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <section className={styles.intro} aria-labelledby="about-heading">
          <h2 id="about-heading" className={styles.sectionTitle}>{c.about.heading}</h2>
          <div className={styles.vDivider} aria-hidden />
          <p className={styles.introText}>{c.about.text}</p>
        </section>

        <section className={styles.purpose} aria-labelledby="purpose-heading">
          <h2 id="purpose-heading" className={styles.sectionTitle}>{c.purpose.heading}</h2>
          <div className={styles.vDivider} aria-hidden />
          <ul className={styles.purposeList}>
            {c.purpose.items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <li key={item.title} className={styles.purposeItem}>
                  <span className={styles.iconBadge}><Icon size={20} strokeWidth={2} aria-hidden /></span>
                  <span className={styles.itemTitle}>{item.title}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.audiences} aria-labelledby="audiences-heading">
          <h2 id="audiences-heading" className={styles.sectionTitle}>{c.audiences.heading}</h2>
          <div className={styles.audienceGrid}>
            <article className={styles.audience}>
              <h3 className={styles.audienceTitle}><Users size={24} strokeWidth={2} aria-hidden /> {c.audiences.buyers.heading}</h3>
              <ul className={styles.list}>{c.audiences.buyers.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </article>
            <article className={styles.audience}>
              <h3 className={styles.audienceTitle}><Store size={24} strokeWidth={2} aria-hidden /> {c.audiences.suppliers.heading}</h3>
              <ul className={styles.list}>{c.audiences.suppliers.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </article>
          </div>
        </section>

        <section className={styles.steps} aria-labelledby="steps-heading">
          <h2 id="steps-heading" className={styles.sectionTitle}>{c.steps.heading}</h2>
          <ol className={styles.stepList}>
            {c.steps.items.map((s, i) => {
              const Icon = ICONS[s.icon];
              return (
                  <li key={s.title} className={styles.stepWrapper}>
                    <div className={styles.step}>
                      <span className={styles.iconBadge}><Icon size={22} strokeWidth={2} aria-hidden /></span>
                      <div className={styles.stepContent}>
                        <strong className={styles.itemTitle}>{i + 1}. {s.title}</strong>
                        <span className={styles.itemText}>{s.text}</span>
                      </div>
                    </div>
                    {i < c.steps.items.length - 1 && (
                      <span className={styles.stepConnector} aria-hidden>
                        <ArrowRight size={20} strokeWidth={2} />
                      </span>
                    )}
                  </li>
                  );
            })}
                </ol>
        </section>

        <section className={styles.cta} aria-labelledby="cta-heading">
          <h2 id="cta-heading" className={styles.ctaTitle}>{c.cta.heading}</h2>
          <div className={styles.actions}>{c.cta.actions.map((a) => <Action key={a.href} {...a} />)}</div>
        </section>
      </Container>
    </>
  );
}
