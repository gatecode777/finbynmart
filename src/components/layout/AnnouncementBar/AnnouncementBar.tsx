import Link from "next/link";
import { ShieldCheck, LifeBuoy, MapPinned } from "lucide-react";
import { Container } from "@/components/ui/Container";
import styles from "./AnnouncementBar.module.css";

export function AnnouncementBar() {
  return (
    <div className={styles.bar}>
      <Container className={styles.inner}>
        <div className={styles.left}>
          <span className={styles.item}>
            <ShieldCheck size={13} strokeWidth={2} aria-hidden />
            India&apos;s B2B Marketplace
          </span>
          <span className={`${styles.item} ${styles.optional}`}>
            <MapPinned size={13} strokeWidth={2} aria-hidden />
            Send Business Inquiries
          </span>
        </div>
        <div className={styles.right}>
          <Link href="/track-inquiry" className={styles.item}>
            Track Inquiry
          </Link>
          <span className={styles.divider} aria-hidden />
          <Link href="/help" className={styles.item}>
            <LifeBuoy size={13} strokeWidth={2} aria-hidden />
            Help
          </Link>
          <span className={styles.divider} aria-hidden />
          <Link href="/contact-us" className={styles.item}>
            Contact Us
          </Link>
        </div>
      </Container>
    </div>
  );
}
