"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, ClipboardList, UserRound, BriefcaseBusiness } from "lucide-react";
import { SearchBar } from "@/components/layout/SearchBar";
import { CATEGORY_NAV } from "@/lib/constants/navigation";
import styles from "./MobileNavigation.module.css";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen(true)}
      >
        <Menu size={22} strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <>
          <div className={styles.overlay} onClick={() => setOpen(false)} />
          <div
            id="mobile-nav-panel"
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
          >
            <div className={styles.panelHeader}>
              <span>Menu</span>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className={styles.section}>
              <SearchBar />
            </div>

            <div className={styles.section}>
              <p className={styles.sectionTitle}>Categories</p>
              <nav className={styles.navList} aria-label="Product categories">
                {CATEGORY_NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.navLink}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className={styles.section}>
              <p className={styles.sectionTitle}>Account</p>
              <nav className={styles.navList} aria-label="Account actions">
                <Link href="/post-requirement" className={styles.navLink} onClick={() => setOpen(false)}>
                  <ClipboardList size={17} strokeWidth={2} aria-hidden />
                  Get Best Price
                </Link>
                <Link href="/sign-in" className={styles.navLink} onClick={() => setOpen(false)}>
                  <UserRound size={17} strokeWidth={2} aria-hidden />
                  Sign In / Join Free
                </Link>
                <Link href="/register-supplier" className={styles.navLink} onClick={() => setOpen(false)}>
                  <BriefcaseBusiness size={17} strokeWidth={2} aria-hidden />
                  For Suppliers
                </Link>
              </nav>
            </div>
          </div>
        </>
      )}
    </>
  );
}
