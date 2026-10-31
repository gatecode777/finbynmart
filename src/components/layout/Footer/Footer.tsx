import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/constants/footer";
import styles from "./Footer.module.css";

const SOCIAL_LINKS = [
  { label: "Facebook", href: "https://facebook.com" },
  { label: "Instagram", href: "https://instagram.com" },
  { label: "LinkedIn", href: "https://linkedin.com" },
  { label: "X", href: "https://x.com" },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <Image
              src="/finbyn-kart-logo.png"
              alt="Finbyn Kart"
              width={193}
              height={53}
              className={styles.logo}
            />
            <p className={styles.tagline}>Powering Digital Commerce</p>
            <p className={styles.description}>
              Finbyn Kart is India&apos;s trusted B2B marketplace connecting
              buyers with verified suppliers, manufacturers and exporters
              across multiple industries.
            </p>
            <div className={styles.social}>
              {SOCIAL_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <p className={styles.colTitle}>{column.title}</p>
              <nav className={styles.linkList} aria-label={column.title}>
                {column.links.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}

          <div>
            <p className={styles.colTitle}>Contact Us</p>
            {/* Real business contact details pending — see docs/MISSING_ASSETS.md */}
            <p className={styles.contactPlaceholder}>
              Contact details to be confirmed with the business before launch.
            </p>
          </div>
        </div>

        <div className={styles.bottom}>
          <span>&copy; {new Date().getFullYear()} Finbyn Kart. All rights reserved.</span>
          <div className={styles.legalLinks}>
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
