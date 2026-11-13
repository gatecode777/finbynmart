"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import { SupplierSidebar } from "./SupplierSidebar";
import { SUPPLIER_NAV, SUPPLIER_NAV_FOOTER } from "./supplierNav";
import { SupplierTopbar } from "./SupplierTopbar";
import styles from "./SupplierShell.module.css";

interface Props {
  companyName: string;
  /** Optional: when omitted the active item is the nav entry whose page the address is inside (the layout cannot know the address). */
  activeKey?: string;
  children: ReactNode;
}

/** The nav item whose href is the longest prefix of the current path, so /supplier/quotations/FBM-QT-... highlights Quotations. */
function activeKeyFor(pathname: string): string {
  if (pathname === "/supplier/security" || pathname.startsWith("/supplier/security/")) return "settings"; // Account Security lives under Settings
  const items = [...SUPPLIER_NAV, ...SUPPLIER_NAV_FOOTER].flatMap((item) => (item.href ?? item.match ? [{ key: item.key, path: (item.href ?? item.match) as string }] : []));
  const match = items.filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
  return match?.key ?? "";
}

/**
 * The workspace shell of every /supplier page (its own, not the buyer's): top bar, dark teal sidebar, drawer on small screens. It is rendered
 * by app/supplier/layout.tsx after the server has proved the signed-in account is a supplier with an active company; only the company's display
 * name reaches the browser. On desktop the menu button switches the sidebar between full and icons only (no hover behaviour; the choice is remembered in this browser); below 1024px it is a drawer.
 */
export function SupplierShell({ companyName, activeKey: givenKey, children }: Props) {
  const pathname = usePathname();
  const activeKey = givenKey ?? activeKeyFor(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [small, setSmall] = useState(false);
  const [iconsOnly, setIconsOnly] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      setIconsOnly(localStorage.getItem("finbyn.supplierSidebar") === "icons");
    } catch {}
  }, []);

  const toggleSidebar = () => {
    if (small) return setDrawerOpen((open) => !open);
    setIconsOnly((v) => {
      try {
        localStorage.setItem("finbyn.supplierSidebar", v ? "full" : "icons");
      } catch {}
      return !v;
    });
  };

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023.98px)");
    const sync = () => setSmall(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const closeDrawer = useCallback((returnFocus: boolean) => {
    setDrawerOpen(false);
    if (returnFocus) menuButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    sidebar.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer(true);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!small) setDrawerOpen(false);
  }, [small]);

  const hideSidebar = small && !drawerOpen;
  return (
    <div className={clsx(styles.shell, iconsOnly && styles.shellIcons)}>
      <a href="#supplier-content" className="skip-link">
        Skip to dashboard content
      </a>
      <SupplierTopbar companyName={companyName} menuOpen={small ? drawerOpen : !iconsOnly} onToggleDrawer={toggleSidebar} menuButtonRef={menuButton} />
      {drawerOpen && <button type="button" className={styles.overlay} aria-label="Close navigation menu" onClick={() => closeDrawer(true)} />}
      <aside id="supplier-sidebar" ref={sidebar} className={clsx(styles.sidebar, drawerOpen && styles.sidebarOpen)} inert={hideSidebar}>
        <div className={styles.sidebarPanel}>
          <SupplierSidebar activeKey={activeKey} collapsed={!small && iconsOnly} onNavigate={() => setDrawerOpen(false)} onToggle={toggleSidebar} />
        </div>
      </aside>
      <div id="supplier-content" className={styles.content} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
