import Link from "next/link";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal";
import { ShieldCheck, Sparkles } from "lucide-react";
import dash from "../Dashboard.module.css";
import styles from "./Settings.module.css";

/**
 * Settings the PRD lists that have nothing behind them. Each says so plainly and has no toggle: a control that looks
 * switchable but does nothing would be a fake setting.
 */
const SECURITY_ITEMS: [string, string][] = [
  ["Two-step verification", "No verification-code system exists, so it cannot be turned on."],
  ["Login alerts", "No email or SMS delivery is configured, so alerts cannot be sent."],
];

const OTHER_ITEMS: [string, string][] = [
  ["Email, SMS and WhatsApp notifications", "No delivery service is connected. Notifications appear only on this site."],
  ["Promotional offers and product recommendations", "No marketing messages are sent and no consent record exists. Nothing is switched on for you."],
  ["Profile visibility", "Buyer profiles are not public anywhere on the site, so there is nothing to change."],
  ["Date and number format", "Not configurable yet. Dates use India time and the Indian number format."],
  ["Business preferences (categories, industries, supplier locations, units)", "No recommendation feature uses them yet, so they are not collected."],
  ["Integrations", "No integration exists."],
];

function Rows({ items }: { items: [string, string][] }) {
  return (
    <ul className={styles.unavailableList}>
      {items.map(([name, reason]) => (
        <li key={name} className={styles.unavailableRow}>
          <span className={styles.unavailableName}>{name}</span>
          <span className={styles.unavailableReason}>{reason}</span>
          <span className={styles.notYet}>Not available yet</span>
        </li>
      ))}
    </ul>
  );
}

export function SecurityNotAvailable() {
  return (
    <section className={dash.card} aria-labelledby="sec-na-title">
      <h2 id="sec-na-title" className={dash.cardTitle}><ShieldCheck size={20} aria-hidden /> More security options</h2>
      <Rows items={SECURITY_ITEMS} />
    </section>
  );
}

export function PrivacyAndMore() {
  return (
    <>
      <section className={dash.card} aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={dash.cardTitle}><ShieldCheck size={20} aria-hidden /> Privacy and data</h2>
        <p className={styles.sectionIntro}>
          Data export and account deletion are not automated yet. To ask for either, contact our support team; nothing is exported or deleted until a person has handled your request.
        </p>
        <ul className={styles.linkList}>
          <li><Link href="/contact-us" className={styles.link}>Contact support</Link></li>
          <li><Link href={PRIVACY_PATH} className={styles.link}>Privacy policy</Link></li>
          <li><Link href={TERMS_PATH} className={styles.link}>Terms and conditions</Link></li>
        </ul>
      </section>
      <section className={dash.card} aria-labelledby="more-title">
        <h2 id="more-title" className={dash.cardTitle}><Sparkles size={20} aria-hidden /> Not available yet</h2>
        <Rows items={OTHER_ITEMS} />
      </section>
    </>
  );
}
