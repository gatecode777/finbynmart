"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, LogOut, Menu, ShoppingCart } from "lucide-react";
import { SearchBar } from "@/components/layout/SearchBar";
import { flashToast } from "@/components/ui/Toast";
import { initialsOf } from "./format";
import { NotificationBell } from "./settings/NotificationBell";
import styles from "./BuyerShell.module.css";

interface BuyerTopbarProps {
  userName: string;
  menuOpen: boolean;
  onToggleDrawer: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}

/** A top bar shortcut for a feature that has no page yet: visible, labelled, and not clickable. */
function Unavailable({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className={clsx(styles.topAction, styles.topActionDisabled)} role="img" aria-label={`${label}: not available yet`} title={`${label}: not available yet`}>
      {icon}
    </span>
  );
}

export function BuyerTopbar({ userName, menuOpen, onToggleDrawer, menuButtonRef }: BuyerTopbarProps) {
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
    if (signingOut) return;
    setSigningOut(true);
    const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      setSigningOut(false);
      return;
    }
    flashToast("success", "You have been signed out.", { deferred: true });
    window.location.assign("/");
  }

  return (
    <header className={styles.topbar}>
      <button ref={menuButtonRef} type="button" className={clsx(styles.iconButton, styles.drawerToggle)} onClick={onToggleDrawer} aria-label="Open navigation menu" aria-expanded={menuOpen} aria-controls="buyer-sidebar">
        <Menu size={22} aria-hidden />
      </button>
      <Link href="/" className={styles.logo} aria-label="Finbyn Mart home">
        <Image src="/images/brand/finbyn-mart-logo.png" alt="Finbyn Mart" width={160} height={44} priority className={styles.logoImage} />
      </Link>
      <div className={styles.search}>
        <SearchBar />
      </div>
      <div className={styles.topActions}>
        <Unavailable icon={<ShoppingCart size={20} aria-hidden />} label="Cart" />
        <NotificationBell />
      </div>
      <div className={styles.profileWrap} ref={wrapRef}>
        <button type="button" className={styles.profileButton} onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="true" aria-controls="buyer-profile-menu">
          <span className={styles.avatarSmall} aria-hidden>
            {initialsOf(userName)}
          </span>
          <span className={styles.profileButtonText}>
            <span className={styles.profileButtonName}>{userName}</span>
            <span className={styles.profileButtonRole}>Buyer Account</span>
          </span>
          <ChevronDown size={16} aria-hidden />
        </button>
        {profileOpen && (
          <div id="buyer-profile-menu" className={styles.profileMenu}>
            <p className={styles.profileMenuNote}>Signed in as {userName}</p>
            <Link href="/buyer/profile" className={styles.profileMenuItem} onClick={() => setProfileOpen(false)}>
              Profile &amp; Company
            </Link>
            <Link href="/buyer/settings" className={styles.profileMenuItem} onClick={() => setProfileOpen(false)}>
              Settings &amp; Notifications
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
