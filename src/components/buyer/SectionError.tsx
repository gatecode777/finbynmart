"use client";

import { useRouter } from "next/navigation";
import styles from "./Dashboard.module.css";

/** One widget could not be loaded: the rest of the dashboard still renders. Retry asks the server again. */
export function SectionError({ name }: { name: string }) {
  const router = useRouter();
  return (
    <div className={styles.sectionError} role="alert">
      <p>{name} could not be loaded just now.</p>
      <button type="button" className={styles.linkButtonSmall} onClick={() => router.refresh()}>
        Retry
      </button>
    </div>
  );
}
