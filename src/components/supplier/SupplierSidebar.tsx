"use client";

import Link from "next/link";
import clsx from "clsx";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SUPPLIER_NAV, SUPPLIER_NAV_FOOTER, type SupplierNavItem } from "./supplierNav";
import styles from "./SupplierShell.module.css";

function NavEntry({ item, active, collapsed, onNavigate }: { item: SupplierNavItem; active: boolean; collapsed: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon size={20} aria-hidden className={styles.navIcon} />
      <span className={clsx(styles.navLabel, collapsed && styles.srOnlyWhenCollapsed)}>{item.label}</span>
      {!item.href && <span className={clsx(styles.soon, collapsed && styles.srOnlyWhenCollapsed)}>Soon</span>}
    </>
  );
  if (!item.href) {
    // no page yet: not a link, so it can never lead to a blank page
    return (
      <li>
        <span className={clsx(styles.navItem, styles.navItemDisabled, active && styles.navItemActive)} aria-disabled="true" aria-current={active ? "location" : undefined} title={item.pending}>
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

export function SupplierSidebar({ activeKey, collapsed, onNavigate, onToggle }: { activeKey: string; collapsed: boolean; onNavigate: () => void; onToggle: () => void }) {
  return (
    <nav className={styles.sidebarNav} aria-label="Supplier navigation">
      <button type="button" className={clsx(styles.navItem, styles.collapseBtn)} onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <PanelLeftOpen size={22} aria-hidden /> : <PanelLeftClose size={22} aria-hidden />}
        {!collapsed && <span>Collapse sidebar</span>}
      </button>
      <ul className={styles.navList}>
        {SUPPLIER_NAV.map((item) => (
          <NavEntry key={item.key} item={item} active={item.key === activeKey} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
      <ul className={clsx(styles.navList, styles.navFooter)}>
        {SUPPLIER_NAV_FOOTER.map((item) => (
          <NavEntry key={item.key} item={item} active={item.key === activeKey} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  );
}
