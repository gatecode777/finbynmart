import { ReactNode } from "react";
import clsx from "clsx";
import { BadgeCheck } from "lucide-react";
import styles from "./Badge.module.css";

interface BadgeProps {
  children: ReactNode;
  variant?: "success" | "neutral";
  icon?: boolean;
}

export function Badge({ children, variant = "neutral", icon }: BadgeProps) {
  return (
    <span className={clsx(styles.badge, styles[variant])}>
      {icon && <BadgeCheck size={13} strokeWidth={2.2} aria-hidden />}
      {children}
    </span>
  );
}
