"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Bell, CreditCard, FileText, LayoutList, MessageSquareText, ScrollText, Settings, ShieldCheck, BarChart3, Layers, Link2, PackageCheck, LifeBuoy, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./AdminShell.module.css";

interface NavItem { key: string; label: string; icon: LucideIcon; href: string; built: boolean }

/** Tracker routes. Only modules that really exist are links; the rest are shown honestly as not available. */
const NAV: NavItem[] = [
  { key: "inquiries", label: "Inquiries", icon: MessageSquareText, href: "/admin/inquiries", built: true },
  { key: "company-links", label: "Company links", icon: Link2, href: "/admin/company-links", built: true },
  { key: "product-review", label: "Product review", icon: PackageCheck, href: "/admin/product-review", built: true },
  { key: "support", label: "Support", icon: LifeBuoy, href: "/admin/support", built: true },
  { key: "quotations", label: "Quotations", icon: FileText, href: "/admin/quotations", built: false },
  { key: "subscriptions", label: "Subscriptions", icon: Layers, href: "/admin/subscriptions", built: false },
  { key: "payments", label: "Payments", icon: CreditCard, href: "/admin/payments", built: false },
  { key: "reports", label: "Reports", icon: BarChart3, href: "/admin/reports", built: false },
  { key: "notifications", label: "Notifications", icon: Bell, href: "/admin/notifications", built: false },
  { key: "content", label: "Content", icon: LayoutList, href: "/admin/content", built: false },
  { key: "settings", label: "Settings", icon: Settings, href: "/admin/settings", built: false },
  { key: "audit", label: "Audit Logs", icon: ScrollText, href: "/admin/audit-logs", built: false },
];

/** The admin portal's own shell (not the supplier or buyer one). Authorization happens in the layout and in every page and API, not here. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeKey = NAV.find((n) => n.built && (pathname === n.href || pathname.startsWith(n.href + "/")))?.key ?? "";
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/admin/inquiries" className={styles.logo} aria-label="Finbyn Mart admin">
          <Image src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" width={140} height={32} priority className={styles.logoImg} />
        </Link>
        <p className={styles.title}>Admin Portal <span className={styles.sub}>Authorized records only.</span></p>
        <ShieldCheck size={20} aria-hidden className={styles.shield} />
      </header>
      <details className={styles.menu}>
        <summary>Administration</summary>
        <Nav activeKey={activeKey} />
      </details>
      <aside className={styles.sidebar} aria-label="Administration">
        <p className={styles.sideTitle}>Administration</p>
        <Nav activeKey={activeKey} />
      </aside>
      <div id="admin-content" className={styles.content}>{children}</div>
    </div>
  );
}

function Nav({ activeKey }: { activeKey: string }) {
  return (
    <nav aria-label="Admin sections">
      <ul className={styles.list}>
        {NAV.map(({ key, label, icon: Icon, href, built }) => (
          <li key={key}>
            {built ? (
              <Link href={href} className={clsx(styles.item, key === activeKey && styles.itemActive)} aria-current={key === activeKey ? "page" : undefined}>
                <Icon size={20} aria-hidden /> {label}
              </Link>
            ) : (
              <span className={clsx(styles.item, styles.itemOff)} aria-disabled="true" title="Not available yet">
                <Icon size={20} aria-hidden /> {label} <span className={styles.soon}>Soon</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
