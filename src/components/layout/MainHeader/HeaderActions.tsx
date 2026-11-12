"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, UserRound, BriefcaseBusiness } from "lucide-react";
import { AUTH_EVENT } from "@/components/ui/Toast/flash";
import styles from "./MainHeader.module.css";

interface Me {
  name: string;
  role: "buyer" | "supplier";
}

/**
 * Role-aware marketplace header actions.
 * - Supplier signed in: Show only Supplier Dashboard/Portal; hide buyer actions ("Get Best Price").
 * - Buyer signed in: Show buyer requirement CTA and Buyer Dashboard; hide supplier onboarding ("For Suppliers").
 * - Guest: Show "Get Best Price", "Sign In", and "For Suppliers".
 */
export function HeaderActions() {
  const pathname = usePathname();
  const [user, setUser] = useState<Me | null>(null);

  useEffect(() => {
    let active = true;
    const read = () =>
      fetch("/api/auth/me", { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => active && setUser(data.user ?? null))
        .catch(() => undefined);
    void read();
    window.addEventListener(AUTH_EVENT, read);
    return () => {
      active = false;
      window.removeEventListener(AUTH_EVENT, read);
    };
  }, [pathname]);

  // SUPPLIER SIGNED IN
  if (user?.role === "supplier") {
    const first = user.name.split(" ")[0];
    return (
      <nav className={styles.actions} aria-label="Supplier account actions">
        <span className={styles.accountSlot}>
          <Link href="/supplier/dashboard" className={`${styles.actionLink} ${styles.cta}`}>
            <span className={styles.actionIcon}>
              <BriefcaseBusiness size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.actionText}>
              <span className={styles.actionTitle}>{first}</span>
              <span className={styles.actionSubtitle}>Supplier Dashboard</span>
            </span>
          </Link>
        </span>
      </nav>
    );
  }

  // BUYER SIGNED IN
  if (user?.role === "buyer") {
    const first = user.name.split(" ")[0];
    return (
      <nav className={styles.actions} aria-label="Buyer account actions">
        <Link href="/post-requirement" className={`${styles.actionLink} ${styles.cta}`}>
          <span className={styles.actionIcon}>
            <ClipboardList size={18} strokeWidth={2} aria-hidden />
          </span>
          <span className={styles.actionText}>
            <span className={styles.actionTitle}>Get Best Price</span>
            <span className={styles.actionSubtitle}>Post Your Requirement</span>
          </span>
        </Link>

        <span className={styles.accountSlot}>
          <Link href="/buyer/dashboard" className={styles.actionLink}>
            <span className={styles.actionIcon}>
              <UserRound size={18} strokeWidth={2} aria-hidden />
            </span>
            <span className={styles.actionText}>
              <span className={styles.actionTitle}>{first}</span>
              <span className={styles.actionSubtitle}>My Dashboard</span>
            </span>
          </Link>
        </span>
      </nav>
    );
  }

  // GUEST (Not signed in)
  return (
    <nav className={styles.actions} aria-label="Account actions">
      <Link href="/post-requirement" className={`${styles.actionLink} ${styles.cta}`}>
        <span className={styles.actionIcon}>
          <ClipboardList size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>Get Best Price</span>
          <span className={styles.actionSubtitle}>Post Your Requirement</span>
        </span>
      </Link>

      <span className={styles.accountSlot}>
        <Link href="/sign-in" className={styles.actionLink}>
          <span className={styles.actionIcon}>
            <UserRound size={18} strokeWidth={2} aria-hidden />
          </span>
          <span className={styles.actionText}>
            <span className={styles.actionTitle}>Sign In</span>
            <span className={styles.actionSubtitle}>Join Free</span>
          </span>
        </Link>
      </span>

      <Link href="/register-supplier" className={styles.actionLink}>
        <span className={styles.actionIcon}>
          <BriefcaseBusiness size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>For Suppliers</span>
          <span className={styles.actionSubtitle}>Grow Your Business</span>
        </span>
      </Link>
    </nav>
  );
}

