import { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ title, children, actions }: EmptyStateProps) {
  return (
    <div className={styles.box}>
      <h2 className={styles.title}>{title}</h2>
      {children && <p className={styles.text}>{children}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
