import Image from "next/image";
import Link from "next/link";
import { ClipboardList, BriefcaseBusiness } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SearchBar } from "@/components/layout/SearchBar";
import { AccountLink } from "./AccountLink";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import styles from "./MainHeader.module.css";

export function MainHeader() {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.inner}>
          <div className={styles.mobileToggle}>
            <MobileNavigation />
          </div>

          <Link href="/" className={styles.logoLink} aria-label="Finbyn Mart home">
            <Image
              src="/images/brand/finbyn-mart-logo.png"
              alt="Finbyn Mart"
              width={600}
              height={132}
              className={styles.logo}
              priority
            />
          </Link>

          <div className={styles.searchSlot}>
            <SearchBar />
          </div>

          <nav className={styles.actions} aria-label="Account actions">
            <Link href="/post-requirement" className={`${styles.actionLink} ${styles.cta}`}>
              <span className={styles.actionIcon}>
                <ClipboardList size={18} strokeWidth={2} aria-hidden />
              </span>
              <span className={styles.actionText}>
                <span className={styles.actionTitle}>Get Best Price</span>
                <span className={styles.actionSubtitle}>Post Your Requirement</span>
              </span>
            </Link>

            <AccountLink />

            <Link href="/register-supplier" className={styles.actionLink}>
              <span className={styles.actionIcon}>
                <BriefcaseBusiness size={18} strokeWidth={2} aria-hidden />
              </span>
              <span className={styles.actionText}>
                <span className={styles.actionTitle}>For Suppliers</span>
                <span className={styles.actionSubtitle}>Grow Your Business</span>
              </span>
            </Link>
          </nav>
        </div>
      </Container>
    </header>
  );
}
