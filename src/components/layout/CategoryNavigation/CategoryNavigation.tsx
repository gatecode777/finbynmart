import Link from "next/link";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Container } from "@/components/ui/Container";
import { CATEGORY_NAV } from "@/lib/constants/navigation";
import styles from "./CategoryNavigation.module.css";

export function CategoryNavigation() {
  return (
    <nav className={styles.nav} aria-label="Product categories">
      <Container>
        <ul className={styles.list}>
          {CATEGORY_NAV.map((item, index) => {
            const isMenuTrigger = item.label === "All Categories";
            return (
              <li key={item.href} className={index === 5 || index === 6 ? styles.wideOnly : undefined}>
                <Link
                  href={item.href}
                  className={clsx(styles.link, index === 0 && styles.first)}
                >
                  {item.label}
                  {isMenuTrigger && (
                    <ChevronDown size={14} strokeWidth={2} aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </nav>
  );
}
