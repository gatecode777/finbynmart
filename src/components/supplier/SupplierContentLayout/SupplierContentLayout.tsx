import { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import styles from "./SupplierContentLayout.module.css";

export function SupplierContentLayout({ main, sidebar }: { main: ReactNode; sidebar: ReactNode }) {
  return (
    <Container>
      <div className={styles.layout}>
        <div className={styles.main}>{main}</div>
        <aside className={styles.sidebar}>{sidebar}</aside>
      </div>
    </Container>
  );
}
