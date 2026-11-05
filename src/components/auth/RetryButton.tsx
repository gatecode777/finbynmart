"use client";

import { useRouter } from "next/navigation";
import styles from "./Auth.module.css";

/** Asks the server for the page again (used when a lookup failed temporarily). */
export function RetryButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button type="button" className={styles.linkButton} onClick={() => router.refresh()}>
      {label}
    </button>
  );
}
