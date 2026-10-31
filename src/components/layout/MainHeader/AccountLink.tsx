"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { signOut } from "@/lib/api/account";
import styles from "./MainHeader.module.css";

interface Me {
  name: string;
  role: "buyer" | "supplier";
}

/** Fetched client-side so the rest of the site can stay statically rendered. */
export function AccountLink() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => active && setUser(data.user ?? null))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    setUser(null);
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

  return (
    <button type="button" className={`${styles.actionLink} ${styles.actionButton}`} onClick={handleSignOut}>
      <span className={styles.actionIcon}>
        <UserRound size={18} strokeWidth={2} aria-hidden />
      </span>
      <span className={styles.actionText}>
        <span className={styles.actionTitle}>{user.name.split(" ")[0]}</span>
        <span className={styles.actionSubtitle}>Sign Out</span>
      </span>
    </button>
  );
}
