import { ReactNode } from "react";
import styles from "./PageIntro.module.css";

interface PageIntroProps {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}

export function PageIntro({ title, subtitle, children }: PageIntroProps) {
  return (
    <header className={styles.intro}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      {children}
    </header>
  );
}
