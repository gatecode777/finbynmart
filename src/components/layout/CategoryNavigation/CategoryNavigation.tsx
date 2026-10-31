import Link from "next/link";
import { Menu, ChevronDown } from "lucide-react";
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
            const isMenuTrigger = item.label === "All Categories" || item.label === "More";
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(styles.link, index === 0 && styles.first)}
                >
                  {index === 0 && <Menu size={16} strokeWidth={2} aria-hidden />}
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
