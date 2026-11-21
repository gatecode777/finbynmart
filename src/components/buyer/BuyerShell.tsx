"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BuyerSidebar } from "./BuyerSidebar";
import { BuyerTopbar } from "./BuyerTopbar";
import styles from "./BuyerShell.module.css";

interface BuyerShellProps {
  userName: string;
  activeKey: string;
  activeInquiries: number | null;
  children: ReactNode;
}

/**
 * The shared workspace shell for every /buyer page: dark sidebar, top bar, drawer on small screens. Pages call
 * requireBuyerPage() first (server side) and pass only the display name, so nothing private reaches the browser.
 * On desktop the sidebar is full width and a button collapses it to icons or expands it again (the choice is remembered in this browser only);
 * it never changes by itself on hover or focus. Below 1024px it is a drawer.
 */
export function BuyerShell({ userName, activeKey, activeInquiries, children }: BuyerShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [small, setSmall] = useState(false);
  const [iconsOnly, setIconsOnly] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023.98px)");
    const sync = () => setSmall(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // the remembered choice (a per-browser convenience: the shell works without it)
  useEffect(() => {
    try { if (window.localStorage.getItem("buyer-sidebar") === "collapsed") setIconsOnly(true); } catch { /* storage unavailable */ }
  }, []);
  const toggleSidebar = () => {
    setIconsOnly((was) => {
      try { window.localStorage.setItem("buyer-sidebar", was ? "expanded" : "collapsed"); } catch { /* storage unavailable */ }
      return !was;
    });
  };

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

  // leaving the small-screen layout closes the drawer
  useEffect(() => {
    if (!small) setDrawerOpen(false);
  }, [small]);

  const hideSidebar = small && !drawerOpen;
  return (
    <div className={clsx(styles.shell, !small && iconsOnly && styles.shellCollapsed)}>
      <a href="#buyer-content" className="skip-link">
        Skip to dashboard content
      </a>
      <BuyerTopbar userName={userName} menuOpen={drawerOpen} onToggleDrawer={() => setDrawerOpen((open) => !open)} menuButtonRef={menuButton} />
      {drawerOpen && <button type="button" className={styles.overlay} aria-label="Close navigation menu" onClick={() => closeDrawer(true)} />}
      <aside id="buyer-sidebar" ref={sidebar} className={clsx(styles.sidebar, drawerOpen && styles.sidebarOpen)} inert={hideSidebar}>
        <div className={styles.sidebarPanel}>
          {!small && (
            <div className={styles.collapseRow}>
              <span className={styles.collapseLabel}>Menu</span>
              <button type="button" className={styles.collapseButton} onClick={toggleSidebar} aria-expanded={!iconsOnly} aria-controls="buyer-sidebar-nav" aria-label={iconsOnly ? "Expand sidebar" : "Collapse sidebar"} title={iconsOnly ? "Expand sidebar" : "Collapse sidebar"}>
                {iconsOnly ? <PanelLeftOpen size={20} aria-hidden /> : <PanelLeftClose size={20} aria-hidden />}
              </button>
            </div>
          )}
          <BuyerSidebar activeKey={activeKey} activeInquiries={activeInquiries} collapsed={!small && iconsOnly} onNavigate={() => setDrawerOpen(false)} />
        </div>
      </aside>
      <div id="buyer-content" className={styles.content} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
