"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { signOut } from "@/lib/api/account";
import { AUTH_EVENT } from "@/components/ui/Toast/flash";
import { announceAuthChange, flashToast } from "@/components/ui/Toast";
import styles from "./MainHeader.module.css";

interface Me {
  name: string;
  role: "buyer" | "supplier";
}

/** Fetched client-side so the rest of the site can stay statically rendered. */
export function AccountLink() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Me | null>(null);

  // The header lives in the root layout and is not remounted when the page changes, so the session is read again after every
  // navigation and whenever sign-in or sign-out announces a change (otherwise it kept showing "Sign In" after signing in).
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

  async function handleSignOut() {
    const response = await signOut().catch(() => null);
    if (!response?.ok) return;
    setUser(null);
    flashToast("success", "You have been signed out.");
    announceAuthChange();
    router.push("/");
    router.refresh();
  }

  if (!user) {
    return (
      <Link href="/sign-in" className={styles.actionLink}>
        <span className={styles.actionIcon}>
          <UserRound size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>Sign In</span>
          <span className={styles.actionSubtitle}>Join Free</span>
        </span>
      </Link>
    );
  }

  const first = user.name.split(" ")[0];
  // A buyer's name opens the buyer dashboard, where Sign out lives (profile menu): the header carries no sign-out for buyers.
  if (user.role === "buyer") {
    return (
      <Link href="/buyer/dashboard" className={styles.actionLink}>
        <span className={styles.actionIcon}>
          <UserRound size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>{first}</span>
          <span className={styles.actionSubtitle}>My Dashboard</span>
        </span>
      </Link>
    );
  }

  // Suppliers have no dashboard yet, so this is their only way to sign out.
  return (
    <button type="button" className={`${styles.actionLink} ${styles.actionButton}`} onClick={handleSignOut}>
      <span className={styles.actionIcon}>
        <UserRound size={18} strokeWidth={2} aria-hidden />
      </span>
      <span className={styles.actionText}>
        <span className={styles.actionTitle}>{first}</span>
        <span className={styles.actionSubtitle}>Sign Out</span>
      </span>
    </button>
  );
}
