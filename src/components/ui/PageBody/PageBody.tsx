import { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import styles from "./PageBody.module.css";

/** Standard content column for a full page: container, vertical rhythm and bottom spacing. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <Container>
      <div className={styles.body}>{children}</div>
    </Container>
  );
}
