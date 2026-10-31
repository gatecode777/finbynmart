import clsx from "clsx";
import { initials } from "@/lib/catalog/slug";
import styles from "./SellerLogo.module.css";

interface SellerLogoProps {
  name: string;
  size?: "sm" | "md" | "lg";
  /** Overrides the initials derived from `name`. */
  text?: string;
}

/**
 * Neutral placeholder shown when a seller has no genuine logo. It deliberately
 * looks like a monogram tile, not a company mark — no logo is invented.
 */
export function SellerLogo({ name, size = "md", text }: SellerLogoProps) {
  const variant = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0 ? styles.teal : styles.cream;

  return (
    <span className={clsx(styles.logo, styles[size], variant)} role="img" aria-label={`${name} (logo not available)`}>
      {text ?? initials(name)}
    </span>
  );
}
