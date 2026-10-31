import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import styles from "./IconButton.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  onDark?: boolean;
}

export function IconButton({
  label,
  onDark,
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={clsx(styles.button, onDark && styles.onDark, className)}
      {...props}
    >
      {children}
    </button>
  );
}
