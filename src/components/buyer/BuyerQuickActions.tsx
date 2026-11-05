import Link from "next/link";
import { BadgeHelp, LayoutGrid, MessageSquareText, Plus, Store, type LucideIcon } from "lucide-react";
import styles from "./Dashboard.module.css";

/** Only actions whose pages exist are offered (compare, saved items and quotations return when those pages are built). */
const ACTIONS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Create New Inquiry", href: "/post-requirement", icon: Plus },
  { label: "Browse Products", href: "/products", icon: LayoutGrid },
  { label: "Find Suppliers", href: "/suppliers", icon: Store },
  { label: "My Inquiries", href: "/buyer/inquiries", icon: MessageSquareText },
  { label: "Contact Support", href: "/contact-us", icon: BadgeHelp },
];

export function BuyerQuickActions() {
  return (
    <section className={styles.card} aria-labelledby="quick-title">
      <h2 id="quick-title" className={styles.cardTitle}>
        Quick Actions
      </h2>
      <ul className={styles.quickGrid}>
        {ACTIONS.map(({ label, href, icon: Icon }) => (
          <li key={label}>
            <Link href={href} className={styles.quickTile}>
              <span className={styles.quickIcon}>
                <Icon size={22} aria-hidden />
              </span>
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
