import { ReactNode } from "react";
import styles from "./AccountSwitch.module.css";

/** Prompt under an account form pointing to the alternative (e.g. sign up instead of sign in). */
export function AccountSwitch({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.box}>
      <p className={styles.title}>{title}</p>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}
