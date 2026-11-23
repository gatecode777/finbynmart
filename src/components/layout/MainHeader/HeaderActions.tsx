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
 * - Supplier signed in: Show only Supplier Dashboard/Portal; hide buyer actions ("Get Quotes").
 * - Buyer signed in: Show buyer requirement CTA and Buyer Dashboard; hide supplier onboarding ("For Suppliers").
 * - Guest: Show "Get Quotes", "Sign In", and "For Suppliers".
 */
export function HeaderActions() {
  const pathname = usePathname();
  // undefined = not known yet (nothing is shown as signed out until the server has answered), null = confirmed signed out
  const [user, setUser] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // a failed or unavailable answer is retried (1 s, 3 s) and only then treated as signed out; it is never taken as "signed out" straight away
    const read = (attempt = 0) => {
      clearTimeout(retry);
      fetch("/api/auth/me", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("unavailable");
          const data = await response.json();
          if (active) setUser(data.user ?? null);
        })
        .catch(() => {
          if (!active) return;
          if (attempt < 2) retry = setTimeout(() => read(attempt + 1), attempt === 0 ? 1000 : 3000);
          else setUser((current) => (current === undefined ? null : current));
        });
    };
    const refresh = () => read();
    const onVisible = () => { if (document.visibilityState === "visible") read(); };
    read();
    window.addEventListener(AUTH_EVENT, refresh);
    window.addEventListener("pageshow", refresh); // coming back from history (bfcache) shows the real state
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(retry);
      window.removeEventListener(AUTH_EVENT, refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  // SUPPLIER SIGNED IN
  if (user?.role === "supplier") {
    const first = user.name.split(" ")[0];
    return (
      <nav className={styles.actions} aria-label="Supplier account actions">
        <span className={styles.accountSlot}>
          <Link prefetch={false} href="/supplier/dashboard" className={`${styles.actionLink} ${styles.cta}`}>
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
        <Link prefetch={false} href="/post-requirement" className={`${styles.actionLink} ${styles.cta}`}>
          <span className={styles.actionIcon}>
            <ClipboardList size={18} strokeWidth={2} aria-hidden />
          </span>
          <span className={styles.actionText}>
            <span className={styles.actionTitle}>Get Quotes</span>
            <span className={styles.actionSubtitle}>Post Your Requirement</span>
          </span>
        </Link>

        <span className={styles.accountSlot}>
          <Link prefetch={false} href="/buyer/dashboard" className={styles.actionLink}>
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

  // GUEST (confirmed not signed in). While the state is still unknown the same nav keeps its space but is hidden, so a signed-in visitor never sees "Sign In".
  return (
    <nav className={styles.actions} aria-label="Account actions" style={user === undefined ? { visibility: "hidden" } : undefined} aria-hidden={user === undefined ? true : undefined}>
      <Link prefetch={false} href="/post-requirement" className={`${styles.actionLink} ${styles.cta}`}>
        <span className={styles.actionIcon}>
          <ClipboardList size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>Get Quotes</span>
          <span className={styles.actionSubtitle}>Post Your Requirement</span>
        </span>
      </Link>

      <span className={styles.accountSlot}>
        <Link prefetch={false} href="/sign-in" className={styles.actionLink}>
          <span className={styles.actionIcon}>
            <UserRound size={18} strokeWidth={2} aria-hidden />
          </span>
          <span className={styles.actionText}>
            <span className={styles.actionTitle}>Sign In</span>
            <span className={styles.actionSubtitle}>Join Free</span>
          </span>
        </Link>
      </span>

      <Link prefetch={false} href="/register-supplier" className={styles.actionLink}>
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

