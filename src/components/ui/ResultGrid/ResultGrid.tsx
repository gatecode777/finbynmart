import { ReactNode } from "react";
import clsx from "clsx";
import styles from "./ResultGrid.module.css";

export function ResultGrid({ variant, children }: { variant: "seller" | "product" | "category"; children: ReactNode }) {
  return <div className={clsx(styles.grid, styles[variant])}>{children}</div>;
}
