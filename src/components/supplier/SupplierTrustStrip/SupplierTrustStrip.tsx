import { ShieldCheck, Boxes, BadgeCheck, Headset } from "lucide-react";
import { Container } from "@/components/ui/Container";
import styles from "./SupplierTrustStrip.module.css";

const ITEMS = [
  { icon: ShieldCheck, title: "Verified Supplier", subtitle: "Trusted & reliable business" },
  { icon: Boxes, title: "Wide Product Range", subtitle: "Browse the full catalogue" },
  { icon: BadgeCheck, title: "Quality Products", subtitle: "Compare before you buy" },
  { icon: Headset, title: "Direct Business Inquiry", subtitle: "Connect with the supplier directly" },
];

export function SupplierTrustStrip({ verified }: { verified: boolean }) {
  const items = verified ? ITEMS : ITEMS.slice(1);

  return (
    <section className={styles.section} aria-label="Why buy from this supplier">
      <Container>
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.title} className={styles.item}>
              <span className={styles.icon}>
                <item.icon size={22} strokeWidth={1.75} aria-hidden />
              </span>
              <span>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.subtitle}>{item.subtitle}</span>
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
