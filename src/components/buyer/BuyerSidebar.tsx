"use client";

import Link from "next/link";
import clsx from "clsx";
import { BUYER_NAV, BUYER_NAV_FOOTER, type BuyerNavItem } from "./buyerNav";
import styles from "./BuyerShell.module.css";

interface BuyerSidebarProps {
  activeKey: string;
  /** From real data; null when it could not be read (no badge is shown). */
  activeInquiries: number | null;
  collapsed: boolean;
  onNavigate: () => void;
}

function NavEntry({ item, active, badge, collapsed, onNavigate }: { item: BuyerNavItem; active: boolean; badge: number | null; collapsed: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon size={20} aria-hidden className={styles.navIcon} />
      <span className={clsx(styles.navLabel, collapsed && styles.srOnlyWhenCollapsed)}>{item.label}</span>
      {badge ? <span className={clsx(styles.badge, collapsed && styles.badgeCollapsed)} aria-label={`${badge} active`}>{badge}</span> : null}
      {!item.href && <span className={clsx(styles.soon, collapsed && styles.srOnlyWhenCollapsed)}>Soon</span>}
    </>
  );
  if (!item.href) {
    // no page yet: not a link, so it can never lead to a blank page
    return (
      <li>
        <span className={clsx(styles.navItem, styles.navItemDisabled)} aria-disabled="true" title={item.pending}>
          {content}
          <span className="visually-hidden">: not available yet. {item.pending}</span>
        </span>
      </li>
    );
  }
  return (
    <li>
      <Link href={item.href} className={clsx(styles.navItem, active && styles.navItemActive)} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} onClick={onNavigate}>
        {content}
      </Link>
    </li>
  );
}

export function BuyerSidebar({ activeKey, activeInquiries, collapsed, onNavigate }: BuyerSidebarProps) {
  const badgeFor = (item: BuyerNavItem) => (item.badge === "activeInquiries" ? activeInquiries : null);
  return (
    <nav className={styles.sidebarNav} aria-label="Buyer navigation">
      <ul className={styles.navList}>
        {BUYER_NAV.map((item) => (
          <NavEntry key={item.key} item={item} active={item.key === activeKey} badge={badgeFor(item)} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
      <ul className={clsx(styles.navList, styles.navFooter)}>
        {BUYER_NAV_FOOTER.map((item) => (
          <NavEntry key={item.key} item={item} active={item.key === activeKey} badge={null} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  );
}
