import { ReactNode } from "react";
import styles from "./PageBody.module.css";

/**
 * Standard content column for a full page: vertical rhythm and bottom spacing.
 * It must sit inside the page's own <Container> (next to the breadcrumb), so the breadcrumb and the
 * content share one left edge. Do not wrap it in a second Container: padding would be applied twice.
 */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}
