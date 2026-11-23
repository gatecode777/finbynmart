"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeHelp, Building2, ChevronDown, LogOut, Menu, Settings } from "lucide-react";
import { SearchBar } from "@/components/layout/SearchBar";
import { flashToast } from "@/components/ui/Toast";
import { NotificationBell } from "./NotificationBell";
import styles from "./SupplierShell.module.css";

interface Props {
  companyName: string;
  menuOpen: boolean;
  onToggleDrawer: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "S";

export function SupplierTopbar({ companyName, menuOpen, onToggleDrawer, menuButtonRef }: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setProfileOpen(false);
      } else if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [profileOpen]);

  async function signOut() {
    setSigningOut(true);
    const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setSigningOut(false);
      flashToast("error", "Sign-out failed. Try again.");
      return;
    }
    flashToast("info", "You have been signed out.", { deferred: true });
    window.location.assign("/sign-in");
  }

  return (
    <header className={styles.topbar}>
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menuButton}
        onClick={onToggleDrawer}
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={menuOpen}
        aria-controls="supplier-sidebar"
      >
        <Menu size={22} aria-hidden />
      </button>
      <Link prefetch={false} href="/supplier/dashboard" className={styles.logo} aria-label="Finbyn Mart supplier dashboard">
        <Image src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" width={140} height={32} priority className={styles.logoImage} />
      </Link>
      <div className={styles.search}>
        <SearchBar />
      </div>
      <div className={styles.topActions}>
        <NotificationBell />
      </div>
      <div className={styles.profileWrap} ref={wrapRef}>
        <button
          type="button"
          className={styles.profileButton}
          onClick={() => setProfileOpen((open) => !open)}
          aria-expanded={profileOpen}
          aria-haspopup="true"
          aria-controls="supplier-profile-menu"
        >
          <span className={styles.avatarSmall} aria-hidden>
            {initials(companyName)}
          </span>
          <span className={styles.profileButtonText}>
            <span className={styles.profileButtonName}>{companyName}</span>
            <span className={styles.profileButtonRole}>Supplier Account</span>
          </span>
          <ChevronDown size={16} aria-hidden />
        </button>
        {profileOpen && (
          <div id="supplier-profile-menu" className={styles.profileMenu}>
            <p className={styles.profileMenuNote}>Signed in as {companyName}</p>
            <Link prefetch={false}
              href="/supplier/company"
              className={styles.profileMenuItem}
              onClick={() => setProfileOpen(false)}
            >
              <Building2 size={16} aria-hidden /> Company Profile
            </Link>
            <Link prefetch={false}
              href="/supplier/settings"
              className={styles.profileMenuItem}
              onClick={() => setProfileOpen(false)}
            >
              <Settings size={16} aria-hidden /> Settings
            </Link>
            <Link prefetch={false}
              href="/supplier/support"
              className={styles.profileMenuItem}
              onClick={() => setProfileOpen(false)}
            >
              <BadgeHelp size={16} aria-hidden /> Help &amp; Support
            </Link>
            <button type="button" className={styles.profileMenuItem} onClick={signOut} disabled={signingOut}>
              <LogOut size={16} aria-hidden /> {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
