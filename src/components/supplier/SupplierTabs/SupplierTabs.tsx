"use client";

import { useState, type MouseEvent } from "react";
import { Home, Boxes, Building2, FileBarChart2, Phone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import styles from "./SupplierTabs.module.css";

const TABS = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "products", label: "Products", icon: Boxes },
  { id: "overview", label: "About Company", icon: Building2 },
  { id: "business-details", label: "Business Details", icon: FileBarChart2 },
  { id: "contact", label: "Contact", icon: Phone },
];

export function SupplierTabs() {
  const [active, setActive] = useState("overview");

  function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className={styles.nav} aria-label="Supplier profile sections">
      <Container>
        <ul className={styles.list}>
          {TABS.map((tab, index) => (
            <li key={`${tab.id}-${index}`}>
              <a
                href={`#${tab.id}`}
                className={`${styles.tab} ${active === tab.id ? styles.active : ""}`}
                onClick={(event) => handleClick(event, tab.id)}
              >
                <tab.icon size={16} strokeWidth={2} aria-hidden />
                {tab.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}
